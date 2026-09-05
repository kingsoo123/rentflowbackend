import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InspectionRecord } from '../inspections/inspection-record.entity';
import { LeaseAgreement } from '../leases/lease-agreement.entity';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { MaintenanceRequestStatus } from '../maintenance/maintenance-request-status.enum';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { Property } from '../properties/property.entity';
import { PropertyBroadcast } from '../tenant-notifications/property-broadcast.entity';
import { TenantNotification } from '../tenant-notifications/tenant-notification.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { PricingCheckout } from '../pricing/pricing-checkout.entity';
import { PricingCheckoutStatus } from '../pricing/pricing-checkout-status.enum';
import { DEFAULT_ADMIN_EMAIL } from './admin.constants';
import { AdminRealtimeService } from './admin-realtime.service';
import { ListAdminSubscriptionPaymentsQueryDto } from './dto/list-admin-subscription-payments.query.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users.query.dto';

export type AdminUserListItem = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
};

export type AdminStats = {
  totalUsers: number;
  propertyManagers: number;
  tenants: number;
  artisans: number;
  admins: number;
  properties: number;
  leases: number;
  openMaintenance: number;
  subscriptionPayments: {
    total: number;
    pending: number;
    successful: number;
    failed: number;
    cancelled: number;
  };
};

export type AdminSubscriptionPaymentListItem = {
  id: string;
  txRef: string;
  planId: string;
  planName: string;
  amountNgn: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  status: PricingCheckoutStatus;
  flutterwaveTransactionId: string | null;
  paidAt: string | null;
  createdAt: string;
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(LeaseAgreement)
    private readonly leaseRepository: Repository<LeaseAgreement>,
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    @InjectRepository(TenantPaymentConfirmation)
    private readonly paymentRepository: Repository<TenantPaymentConfirmation>,
    @InjectRepository(PropertyBroadcast)
    private readonly broadcastRepository: Repository<PropertyBroadcast>,
    @InjectRepository(TenantNotification)
    private readonly notificationRepository: Repository<TenantNotification>,
    @InjectRepository(InspectionRecord)
    private readonly inspectionRepository: Repository<InspectionRecord>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    @InjectRepository(PricingCheckout)
    private readonly pricingCheckoutRepository: Repository<PricingCheckout>,
    private readonly config: ConfigService,
    private readonly adminRealtime: AdminRealtimeService,
  ) {}

  private platformAdminEmail(): string {
    return (
      this.config.get<string>('ADMIN_EMAIL') ?? DEFAULT_ADMIN_EMAIL
    )
      .trim()
      .toLowerCase();
  }

  async getStats(): Promise<AdminStats> {
    const [
      totalUsers,
      propertyManagers,
      tenants,
      artisans,
      admins,
      properties,
      leases,
      openMaintenance,
      subscriptionPayments,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.count({
        where: { role: UserRole.PROPERTY_MANAGER },
      }),
      this.usersRepository.count({ where: { role: UserRole.TENANT } }),
      this.usersRepository.count({ where: { role: UserRole.ARTISAN } }),
      this.usersRepository.count({ where: { role: UserRole.ADMIN } }),
      this.propertyRepository.count(),
      this.leaseRepository.count(),
      this.maintenanceRepository.count({
        where: { status: Not(MaintenanceRequestStatus.RESOLVED) },
      }),
      this.subscriptionPaymentCounts(),
    ]);

    return {
      totalUsers,
      propertyManagers,
      tenants,
      artisans,
      admins,
      properties,
      leases,
      openMaintenance,
      subscriptionPayments,
    };
  }

  async listSubscriptionPayments(
    query: ListAdminSubscriptionPaymentsQueryDto,
  ): Promise<{
    items: AdminSubscriptionPaymentListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const qb = this.pricingCheckoutRepository
      .createQueryBuilder('p')
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(p.customerName ILIKE :term ESCAPE '\\' OR p.customerEmail ILIKE :term ESCAPE '\\' OR p.txRef ILIKE :term ESCAPE '\\' OR p.planName ILIKE :term ESCAPE '\\')`,
        { term: `%${search.replace(/[%_\\]/g, '\\$&')}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toSubscriptionPaymentItem(row)),
      total,
      page,
      limit,
    };
  }

  async listUsers(query: ListAdminUsersQueryDto): Promise<{
    items: AdminUserListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const qb = this.usersRepository
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.role) {
      qb.andWhere('u.role = :role', { role: query.role });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(u.email ILIKE :term ESCAPE '\\' OR u.fullName ILIKE :term ESCAPE '\\')`,
        { term: `%${search.replace(/[%_\\]/g, '\\$&')}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((u) => this.toListItem(u)),
      total,
      page,
      limit,
    };
  }

  async getUserDetail(id: string) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activity = await this.buildActivityForUser(user);
    let profile: Record<string, unknown> | null = null;
    if (user.role === UserRole.TENANT) {
      const tp = await this.tenantProfileRepository.findOne({
        where: { userId: id },
      });
      if (
        tp?.profileData &&
        typeof tp.profileData === 'object' &&
        !Array.isArray(tp.profileData)
      ) {
        profile = tp.profileData;
      }
    }

    return {
      user: this.toListItem(user),
      profile,
      activity,
    };
  }

  async hardDeleteUser(
    actorUserId: string,
    targetUserId: string,
  ): Promise<{ deleted: true; id: string; email: string; role: UserRole }> {
    if (actorUserId === targetUserId) {
      throw new BadRequestException('You cannot delete your own admin account.');
    }

    const target = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.email.trim().toLowerCase() === this.platformAdminEmail()) {
      throw new ForbiddenException(
        'The platform admin account cannot be hard-deleted.',
      );
    }

    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot be hard-deleted.');
    }

    await this.usersRepository.delete({ id: targetUserId });

    this.adminRealtime.notifyAccountsChanged('deleted');

    return {
      deleted: true,
      id: target.id,
      email: target.email,
      role: target.role,
    };
  }

  private async subscriptionPaymentCounts() {
    const [total, pending, successful, failed, cancelled] = await Promise.all([
      this.pricingCheckoutRepository.count(),
      this.pricingCheckoutRepository.count({
        where: { status: PricingCheckoutStatus.PENDING },
      }),
      this.pricingCheckoutRepository.count({
        where: { status: PricingCheckoutStatus.SUCCESSFUL },
      }),
      this.pricingCheckoutRepository.count({
        where: { status: PricingCheckoutStatus.FAILED },
      }),
      this.pricingCheckoutRepository.count({
        where: { status: PricingCheckoutStatus.CANCELLED },
      }),
    ]);
    return { total, pending, successful, failed, cancelled };
  }

  private toSubscriptionPaymentItem(
    row: PricingCheckout,
  ): AdminSubscriptionPaymentListItem {
    return {
      id: row.id,
      txRef: row.txRef,
      planId: row.planId,
      planName: row.planName,
      amountNgn: row.amountNgn,
      currency: row.currency,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      status: row.status,
      flutterwaveTransactionId: row.flutterwaveTransactionId,
      paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private toListItem(u: User): AdminUserListItem {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      phoneCountryCode: u.phoneCountryCode,
      phoneNumber: u.phoneNumber,
      emailVerifiedAt: u.emailVerifiedAt
        ? new Date(u.emailVerifiedAt).toISOString()
        : null,
      createdAt: new Date(u.createdAt).toISOString(),
    };
  }

  private async buildActivityForUser(user: User) {
    if (user.role === UserRole.PROPERTY_MANAGER) {
      const properties = await this.propertyRepository.find({
        where: { managerUserId: user.id },
        order: { createdAt: 'DESC' },
      });
      const leases = await this.leaseRepository.find({
        where: { managerUserId: user.id },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const payments = await this.paymentRepository.find({
        where: { managerUserId: user.id },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const broadcasts = await this.broadcastRepository.find({
        where: { managerId: user.id },
        order: { createdAt: 'DESC' },
        take: 40,
      });
      const inspections = await this.inspectionRepository.find({
        where: { managerUserId: user.id },
        order: { createdAt: 'DESC' },
        take: 40,
      });
      const maintenance = await this.maintenanceForManager(user.id);
      const tenantsOnRoster = await this.countTenantsOnManagerRoster(user.id);

      return {
        properties: properties.map((p) => ({
          id: p.id,
          name: p.name,
          city: p.city,
          unitCount: p.unitCount,
          createdAt: new Date(p.createdAt).toISOString(),
        })),
        leases: leases.map((l) => this.mapLease(l)),
        maintenance: maintenance.map((m) => this.mapMaint(m)),
        payments: payments.map((p) => this.mapPay(p)),
        broadcasts: broadcasts.map((b) => ({
          id: b.id,
          headline: b.headline,
          tenantCount: b.tenantCount,
          createdAt: new Date(b.createdAt).toISOString(),
          bodyPreview: b.body.slice(0, 160),
        })),
        inspections: inspections.map((i) => ({
          id: i.id,
          type: i.type,
          status: i.status,
          unitLabel: i.unitLabel,
          inspectedAt: i.inspectedAt,
          createdAt: new Date(i.createdAt).toISOString(),
        })),
        counts: {
          properties: properties.length,
          tenantsOnRoster,
          leases: await this.leaseRepository.count({
            where: { managerUserId: user.id },
          }),
          payments: await this.paymentRepository.count({
            where: { managerUserId: user.id },
          }),
          broadcasts: await this.broadcastRepository.count({
            where: { managerId: user.id },
          }),
          inspections: await this.inspectionRepository.count({
            where: { managerUserId: user.id },
          }),
          openMaintenance: maintenance.filter(
            (m) => m.status !== MaintenanceRequestStatus.RESOLVED,
          ).length,
        },
      };
    }

    if (user.role === UserRole.TENANT) {
      const leases = await this.leaseRepository.find({
        where: { tenantId: user.id },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const maintenance = await this.maintenanceRepository.find({
        where: { tenantId: user.id },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const payments = await this.paymentRepository.find({
        where: { tenantId: user.id },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const notifications = await this.notificationRepository.find({
        where: { tenantId: user.id },
        order: { createdAt: 'DESC' },
        take: 40,
      });

      return {
        leases: leases.map((l) => this.mapLease(l)),
        maintenance: maintenance.map((m) => this.mapMaint(m)),
        payments: payments.map((p) => this.mapPay(p)),
        notifications: notifications.map((n) => ({
          id: n.id,
          kind: n.kind,
          headline: n.headline,
          createdAt: new Date(n.createdAt).toISOString(),
          bodyPreview: n.body.slice(0, 160),
        })),
        counts: {
          leases: leases.length,
          maintenance: maintenance.length,
          payments: payments.length,
          notifications: await this.notificationRepository.count({
            where: { tenantId: user.id },
          }),
        },
      };
    }

    return {
      leases: [],
      maintenance: [],
      payments: [],
      counts: {},
    };
  }

  private mapLease(l: LeaseAgreement) {
    return {
      id: l.id,
      title: l.title,
      status: l.status,
      propertyId: l.propertyId,
      rentAmount: l.rentAmount,
      startDate: l.startDate,
      endDate: l.endDate,
      createdAt: new Date(l.createdAt).toISOString(),
    };
  }

  private mapMaint(m: MaintenanceRequest) {
    return {
      id: m.id,
      title: m.title,
      status: m.status,
      urgency: m.urgency,
      createdAt: new Date(m.createdAt).toISOString(),
    };
  }

  private mapPay(p: TenantPaymentConfirmation) {
    return {
      id: p.id,
      status: p.status,
      paymentType: p.paymentType,
      amountDisplay: p.amountDisplay,
      createdAt: new Date(p.createdAt).toISOString(),
    };
  }

  private async maintenanceForManager(
    managerUserId: string,
  ): Promise<MaintenanceRequest[]> {
    const properties = await this.propertyRepository.find({
      where: { managerUserId },
      select: ['id', 'name'],
    });
    if (properties.length === 0) {
      return [];
    }
    const names = properties.map((p) => p.name.trim().toLowerCase());
    return this.maintenanceRepository
      .createQueryBuilder('m')
      .innerJoin(TenantProfile, 'tp', 'tp.userId = m.tenantId')
      .where(
        `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) IN (:...names)`,
        { names },
      )
      .orderBy('m.createdAt', 'DESC')
      .take(50)
      .getMany();
  }

  private async countTenantsOnManagerRoster(
    managerUserId: string,
  ): Promise<number> {
    return this.usersRepository
      .createQueryBuilder('u')
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .where('u.role = :role', { role: UserRole.TENANT })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM properties p
          WHERE p.manager_user_id = :managerUserId
            AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
        )`,
        { managerUserId },
      )
      .getCount();
  }
}
