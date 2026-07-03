import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ManagerArtisanRoster } from '../managers/manager-artisan-roster.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { ManagerArtisanDirectMessage } from './manager-artisan-direct-message.entity';
import { ManagerArtisanDirectMessageThread } from './manager-artisan-direct-message-thread.entity';
import { DirectMessagesRealtimeService } from './direct-messages-realtime.service';

export type ArtisanDirectMessageRow = {
  id: string;
  threadId: string;
  senderRole: 'property_manager' | 'artisan';
  senderName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type ArtisanDirectMessageThreadSummary = {
  threadId: string;
  artisanId: string;
  artisanName: string;
  artisanEmail: string;
  managerUserId: string;
  managerName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

@Injectable()
export class ManagerArtisanDirectMessagesService {
  constructor(
    @InjectRepository(ManagerArtisanDirectMessageThread)
    private readonly threadsRepository: Repository<ManagerArtisanDirectMessageThread>,
    @InjectRepository(ManagerArtisanDirectMessage)
    private readonly messagesRepository: Repository<ManagerArtisanDirectMessage>,
    @InjectRepository(ManagerArtisanRoster)
    private readonly rosterRepository: Repository<ManagerArtisanRoster>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly directMessagesRealtime: DirectMessagesRealtimeService,
  ) {}

  async listThreadsForManager(
    managerUserId: string,
    search?: string,
  ): Promise<ArtisanDirectMessageThreadSummary[]> {
    const qb = this.threadsRepository
      .createQueryBuilder('t')
      .where('t.manager_user_id = :managerUserId', { managerUserId })
      .orderBy('t.updated_at', 'DESC')
      .take(100);

    if (search?.trim()) {
      const term = `%${escapeIlike(search.trim())}%`;
      qb.innerJoin(User, 'u', 'u.id = t.artisan_user_id')
        .andWhere('(u.full_name ILIKE :term ESCAPE \'\\\' OR u.email ILIKE :term ESCAPE \'\\\')', {
          term,
        });
    }

    const threads = await qb.getMany();
    return this.buildThreadSummaries(threads, 'manager', managerUserId);
  }

  async listThreadsForArtisan(artisanUserId: string): Promise<ArtisanDirectMessageThreadSummary[]> {
    const rosterRows = await this.rosterRepository.find({
      where: { artisanUserId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const managerIds = [...new Set(rosterRows.map((r) => r.managerUserId))];
    if (managerIds.length === 0) {
      return [];
    }

    const threads = await this.threadsRepository.find({
      where: { artisanUserId, managerUserId: In(managerIds) },
      order: { updatedAt: 'DESC' },
      take: 20,
    });

    if (threads.length === 0) {
      const managers = await this.usersRepository.find({
        where: { id: In(managerIds), role: UserRole.PROPERTY_MANAGER },
        select: ['id', 'fullName', 'email'],
      });
      return managers.map((m) => ({
        threadId: '',
        artisanId: artisanUserId,
        artisanName: '',
        artisanEmail: '',
        managerUserId: m.id,
        managerName: m.fullName?.trim() || m.email?.trim() || 'Property manager',
        lastMessageBody: null,
        lastMessageAt: null,
        unreadCount: 0,
      }));
    }

    return this.buildThreadSummaries(threads, 'artisan', artisanUserId);
  }

  async listMessagesForManager(
    managerUserId: string,
    artisanUserId: string,
  ): Promise<{ threadId: string; messages: ArtisanDirectMessageRow[] }> {
    await this.assertArtisanOnManagerRoster(managerUserId, artisanUserId);
    const thread = await this.getOrCreateThread(managerUserId, artisanUserId);
    await this.markMessagesRead(thread.id, 'property_manager');
    const messages = await this.loadMessages(thread.id);
    return { threadId: thread.id, messages };
  }

  async listMessagesForArtisan(
    artisanUserId: string,
    threadId: string,
  ): Promise<{ threadId: string; messages: ArtisanDirectMessageRow[] }> {
    const thread = await this.assertThreadForArtisan(artisanUserId, threadId);
    await this.markMessagesRead(thread.id, 'artisan');
    const messages = await this.loadMessages(thread.id);
    return { threadId: thread.id, messages };
  }

  async sendFromManager(
    managerUserId: string,
    artisanUserId: string,
    body: string,
  ): Promise<ArtisanDirectMessageRow> {
    await this.assertArtisanOnManagerRoster(managerUserId, artisanUserId);
    const thread = await this.getOrCreateThread(managerUserId, artisanUserId);
    return this.saveMessage(thread, managerUserId, UserRole.PROPERTY_MANAGER, body);
  }

  async sendFromArtisan(
    artisanUserId: string,
    threadId: string,
    body: string,
  ): Promise<ArtisanDirectMessageRow> {
    let thread: ManagerArtisanDirectMessageThread;
    if (threadId.trim()) {
      thread = await this.assertThreadForArtisan(artisanUserId, threadId);
    } else {
      const rosterRows = await this.rosterRepository.find({
        where: { artisanUserId },
        order: { createdAt: 'ASC' },
        take: 1,
      });
      if (rosterRows.length === 0) {
        throw new ForbiddenException(
          'No property manager is linked to your worker roster yet.',
        );
      }
      thread = await this.getOrCreateThread(rosterRows[0].managerUserId, artisanUserId);
    }
    return this.saveMessage(thread, artisanUserId, UserRole.ARTISAN, body);
  }

  private async assertArtisanOnManagerRoster(
    managerUserId: string,
    artisanUserId: string,
  ): Promise<void> {
    const row = await this.rosterRepository.findOne({
      where: { managerUserId, artisanUserId },
    });
    if (!row) {
      throw new ForbiddenException('Worker is not on your roster.');
    }
    const artisan = await this.usersRepository.findOne({
      where: { id: artisanUserId, role: UserRole.ARTISAN },
    });
    if (!artisan) {
      throw new NotFoundException('Worker not found.');
    }
  }

  private async getOrCreateThread(
    managerUserId: string,
    artisanUserId: string,
  ): Promise<ManagerArtisanDirectMessageThread> {
    let thread = await this.threadsRepository.findOne({
      where: { managerUserId, artisanUserId },
    });
    if (!thread) {
      thread = this.threadsRepository.create({ managerUserId, artisanUserId });
      thread = await this.threadsRepository.save(thread);
    }
    return thread;
  }

  private async assertThreadForArtisan(
    artisanUserId: string,
    threadId: string,
  ): Promise<ManagerArtisanDirectMessageThread> {
    const thread = await this.threadsRepository.findOne({ where: { id: threadId } });
    if (!thread || thread.artisanUserId !== artisanUserId) {
      throw new NotFoundException('Conversation not found');
    }
    const rosterRow = await this.rosterRepository.findOne({
      where: { artisanUserId, managerUserId: thread.managerUserId },
    });
    if (!rosterRow) {
      throw new ForbiddenException('Conversation not available');
    }
    return thread;
  }

  private async saveMessage(
    thread: ManagerArtisanDirectMessageThread,
    senderUserId: string,
    senderRole: UserRole.PROPERTY_MANAGER | UserRole.ARTISAN,
    body: string,
  ): Promise<ArtisanDirectMessageRow> {
    const row = this.messagesRepository.create({
      threadId: thread.id,
      senderUserId,
      senderRole,
      body: body.trim(),
      readAt: null,
    });
    const saved = await this.messagesRepository.save(row);
    thread.updatedAt = new Date();
    await this.threadsRepository.save(thread);

    const sender = await this.usersRepository.findOne({
      where: { id: senderUserId },
      select: ['id', 'fullName', 'email'],
    });

    this.directMessagesRealtime.notifyArtisanDirectMessageCreated({
      threadId: thread.id,
      messageId: saved.id,
      managerUserId: thread.managerUserId,
      artisanUserId: thread.artisanUserId,
    });

    return {
      id: saved.id,
      threadId: thread.id,
      senderRole: senderRole === UserRole.PROPERTY_MANAGER ? 'property_manager' : 'artisan',
      senderName: sender?.fullName?.trim() || sender?.email?.trim() || 'User',
      body: saved.body,
      createdAt: saved.createdAt.toISOString(),
      readAt: null,
    };
  }

  private async loadMessages(threadId: string): Promise<ArtisanDirectMessageRow[]> {
    const rows = await this.messagesRepository.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    if (rows.length === 0) {
      return [];
    }
    const senderIds = [...new Set(rows.map((r) => r.senderUserId))];
    const senders = await this.usersRepository.find({
      where: { id: In(senderIds) },
      select: ['id', 'fullName', 'email'],
    });
    const byId = new Map(senders.map((u) => [u.id, u]));
    return rows.map((r) => {
      const sender = byId.get(r.senderUserId);
      return {
        id: r.id,
        threadId: r.threadId,
        senderRole:
          r.senderRole === UserRole.PROPERTY_MANAGER ? 'property_manager' : 'artisan',
        senderName: sender?.fullName?.trim() || sender?.email?.trim() || 'User',
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
      };
    });
  }

  private async markMessagesRead(
    threadId: string,
    readerRole: 'property_manager' | 'artisan',
  ): Promise<void> {
    const senderRoleToMark =
      readerRole === 'property_manager' ? UserRole.ARTISAN : UserRole.PROPERTY_MANAGER;
    await this.messagesRepository
      .createQueryBuilder()
      .update(ManagerArtisanDirectMessage)
      .set({ readAt: () => 'now()' })
      .where('thread_id = :threadId', { threadId })
      .andWhere('sender_role = :senderRole', { senderRole: senderRoleToMark })
      .andWhere('read_at IS NULL')
      .execute();
  }

  private async buildThreadSummaries(
    threads: ManagerArtisanDirectMessageThread[],
    viewer: 'manager' | 'artisan',
    viewerId: string,
  ): Promise<ArtisanDirectMessageThreadSummary[]> {
    if (threads.length === 0) {
      return [];
    }

    const threadIds = threads.map((t) => t.id);
    const artisanIds = [...new Set(threads.map((t) => t.artisanUserId))];
    const managerIds = [...new Set(threads.map((t) => t.managerUserId))];

    const users = await this.usersRepository.find({
      where: { id: In([...artisanIds, ...managerIds]) },
      select: ['id', 'fullName', 'email', 'role'],
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const lastByThread = new Map<string, ManagerArtisanDirectMessage>();
    const recentMessages = await this.messagesRepository.find({
      where: { threadId: In(threadIds) },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    for (const message of recentMessages) {
      if (!lastByThread.has(message.threadId)) {
        lastByThread.set(message.threadId, message);
      }
    }

    const unreadSenderRole =
      viewer === 'manager' ? UserRole.ARTISAN : UserRole.PROPERTY_MANAGER;
    const unreadRows = await this.messagesRepository
      .createQueryBuilder('m')
      .select('m.thread_id', 'threadId')
      .addSelect('COUNT(*)', 'count')
      .where('m.thread_id IN (:...threadIds)', { threadIds })
      .andWhere('m.sender_role = :senderRole', { senderRole: unreadSenderRole })
      .andWhere('m.read_at IS NULL')
      .groupBy('m.thread_id')
      .getRawMany<{ threadId: string; count: string }>();
    const unreadByThread = new Map(
      unreadRows.map((r) => [r.threadId, Number.parseInt(r.count, 10) || 0]),
    );

    return threads.map((t) => {
      const artisan = userById.get(t.artisanUserId);
      const manager = userById.get(t.managerUserId);
      const last = lastByThread.get(t.id);
      return {
        threadId: t.id,
        artisanId: t.artisanUserId,
        artisanName: artisan?.fullName?.trim() || artisan?.email?.trim() || 'Worker',
        artisanEmail: artisan?.email ?? '',
        managerUserId: t.managerUserId,
        managerName:
          manager?.fullName?.trim() || manager?.email?.trim() || 'Property manager',
        lastMessageBody: last?.body ?? null,
        lastMessageAt: last?.createdAt.toISOString() ?? null,
        unreadCount: unreadByThread.get(t.id) ?? 0,
      };
    });
  }
}

function escapeIlike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
