import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { DirectMessage } from './direct-message.entity';
import { DirectMessageThread } from './direct-message-thread.entity';
import { DirectMessagesRealtimeService } from './direct-messages-realtime.service';

export type DirectMessageRow = {
  id: string;
  threadId: string;
  senderRole: 'property_manager' | 'tenant';
  senderName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type DirectMessageThreadSummary = {
  threadId: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  managerUserId: string;
  managerName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

@Injectable()
export class DirectMessagesService {
  constructor(
    @InjectRepository(DirectMessageThread)
    private readonly threadsRepository: Repository<DirectMessageThread>,
    @InjectRepository(DirectMessage)
    private readonly messagesRepository: Repository<DirectMessage>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly directMessagesRealtime: DirectMessagesRealtimeService,
  ) {}

  async listThreadsForManager(
    managerUserId: string,
    search?: string,
  ): Promise<DirectMessageThreadSummary[]> {
    const qb = this.threadsRepository
      .createQueryBuilder('t')
      .where('t.manager_user_id = :managerUserId', { managerUserId })
      .orderBy('t.updated_at', 'DESC')
      .take(100);

    if (search?.trim()) {
      const term = `%${escapeIlike(search.trim())}%`;
      qb.innerJoin(User, 'u', 'u.id = t.tenant_id')
        .andWhere('(u.full_name ILIKE :term ESCAPE \'\\\' OR u.email ILIKE :term ESCAPE \'\\\')', {
          term,
        });
    }

    const threads = await qb.getMany();
    return this.buildThreadSummaries(threads, 'manager', managerUserId);
  }

  async listThreadsForTenant(tenantId: string): Promise<DirectMessageThreadSummary[]> {
    const managerIds =
      await this.managersTenantsService.listManagerUserIdsForTenantOnRoster(tenantId);
    if (managerIds.length === 0) {
      return [];
    }

    const threads = await this.threadsRepository.find({
      where: { tenantId, managerUserId: In(managerIds) },
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
        tenantId,
        tenantName: '',
        tenantEmail: '',
        managerUserId: m.id,
        managerName: m.fullName?.trim() || m.email?.trim() || 'Property manager',
        lastMessageBody: null,
        lastMessageAt: null,
        unreadCount: 0,
      }));
    }

    return this.buildThreadSummaries(threads, 'tenant', tenantId);
  }

  async listMessagesForManager(
    managerUserId: string,
    tenantId: string,
  ): Promise<{ threadId: string; messages: DirectMessageRow[] }> {
    await this.managersTenantsService.assertTenantBelongsToManager(
      managerUserId,
      tenantId,
    );
    const thread = await this.getOrCreateThread(managerUserId, tenantId);
    await this.markMessagesRead(thread.id, 'property_manager');
    const messages = await this.loadMessages(thread.id);
    return { threadId: thread.id, messages };
  }

  async listMessagesForTenant(
    tenantId: string,
    threadId: string,
  ): Promise<{ threadId: string; messages: DirectMessageRow[] }> {
    const thread = await this.assertThreadForTenant(tenantId, threadId);
    await this.markMessagesRead(thread.id, 'tenant');
    const messages = await this.loadMessages(thread.id);
    return { threadId: thread.id, messages };
  }

  async sendFromManager(
    managerUserId: string,
    tenantId: string,
    body: string,
  ): Promise<DirectMessageRow> {
    await this.managersTenantsService.assertTenantBelongsToManager(
      managerUserId,
      tenantId,
    );
    const thread = await this.getOrCreateThread(managerUserId, tenantId);
    const saved = await this.saveMessage(
      thread,
      managerUserId,
      UserRole.PROPERTY_MANAGER,
      body,
    );
    return saved;
  }

  async sendFromTenant(
    tenantId: string,
    threadId: string,
    body: string,
  ): Promise<DirectMessageRow> {
    let thread: DirectMessageThread;
    if (threadId.trim()) {
      thread = await this.assertThreadForTenant(tenantId, threadId);
    } else {
      const managerIds =
        await this.managersTenantsService.listManagerUserIdsForTenantOnRoster(tenantId);
      if (managerIds.length === 0) {
        throw new ForbiddenException(
          'No property manager is linked to your assigned building yet.',
        );
      }
      thread = await this.getOrCreateThread(managerIds[0], tenantId);
    }
    const saved = await this.saveMessage(thread, tenantId, UserRole.TENANT, body);
    return saved;
  }

  private async getOrCreateThread(
    managerUserId: string,
    tenantId: string,
  ): Promise<DirectMessageThread> {
    let thread = await this.threadsRepository.findOne({
      where: { managerUserId, tenantId },
    });
    if (!thread) {
      thread = this.threadsRepository.create({ managerUserId, tenantId });
      thread = await this.threadsRepository.save(thread);
    }
    return thread;
  }

  private async assertThreadForTenant(
    tenantId: string,
    threadId: string,
  ): Promise<DirectMessageThread> {
    const thread = await this.threadsRepository.findOne({ where: { id: threadId } });
    if (!thread || thread.tenantId !== tenantId) {
      throw new NotFoundException('Conversation not found');
    }
    const managerIds =
      await this.managersTenantsService.listManagerUserIdsForTenantOnRoster(tenantId);
    if (!managerIds.includes(thread.managerUserId)) {
      throw new ForbiddenException('Conversation not available');
    }
    return thread;
  }

  private async saveMessage(
    thread: DirectMessageThread,
    senderUserId: string,
    senderRole: UserRole.PROPERTY_MANAGER | UserRole.TENANT,
    body: string,
  ): Promise<DirectMessageRow> {
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

    this.directMessagesRealtime.notifyMessageCreated({
      threadId: thread.id,
      messageId: saved.id,
      managerUserId: thread.managerUserId,
      tenantId: thread.tenantId,
    });

    return {
      id: saved.id,
      threadId: thread.id,
      senderRole: senderRole === UserRole.PROPERTY_MANAGER ? 'property_manager' : 'tenant',
      senderName:
        sender?.fullName?.trim() || sender?.email?.trim() || 'User',
      body: saved.body,
      createdAt: saved.createdAt.toISOString(),
      readAt: null,
    };
  }

  private async loadMessages(threadId: string): Promise<DirectMessageRow[]> {
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
          r.senderRole === UserRole.PROPERTY_MANAGER ? 'property_manager' : 'tenant',
        senderName:
          sender?.fullName?.trim() || sender?.email?.trim() || 'User',
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
      };
    });
  }

  private async markMessagesRead(
    threadId: string,
    readerRole: 'property_manager' | 'tenant',
  ): Promise<void> {
    const senderRoleToMark =
      readerRole === 'property_manager' ? UserRole.TENANT : UserRole.PROPERTY_MANAGER;
    await this.messagesRepository
      .createQueryBuilder()
      .update(DirectMessage)
      .set({ readAt: () => 'now()' })
      .where('thread_id = :threadId', { threadId })
      .andWhere('sender_role = :senderRole', { senderRole: senderRoleToMark })
      .andWhere('read_at IS NULL')
      .execute();
  }

  private async buildThreadSummaries(
    threads: DirectMessageThread[],
    viewer: 'manager' | 'tenant',
    viewerId: string,
  ): Promise<DirectMessageThreadSummary[]> {
    if (threads.length === 0) {
      return [];
    }

    const threadIds = threads.map((t) => t.id);
    const tenantIds = [...new Set(threads.map((t) => t.tenantId))];
    const managerIds = [...new Set(threads.map((t) => t.managerUserId))];

    const users = await this.usersRepository.find({
      where: { id: In([...tenantIds, ...managerIds]) },
      select: ['id', 'fullName', 'email', 'role'],
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const lastByThread = new Map<string, DirectMessage>();
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
      viewer === 'manager' ? UserRole.TENANT : UserRole.PROPERTY_MANAGER;
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
      const tenant = userById.get(t.tenantId);
      const manager = userById.get(t.managerUserId);
      const last = lastByThread.get(t.id);
      return {
        threadId: t.id,
        tenantId: t.tenantId,
        tenantName: tenant?.fullName?.trim() || tenant?.email?.trim() || 'Tenant',
        tenantEmail: tenant?.email ?? '',
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
