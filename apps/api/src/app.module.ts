import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { I18nInterceptor } from './i18n.util';
import { AuthModule } from './auth';
import { CatalogModule } from './catalog';
import { MembershipModule } from './membership';
import { DropsModule } from './drops';
import { BenefitsModule } from './benefits';
import { OrdersModule } from './orders';
import { ScanModule } from './scan';
import { MerchantModule } from './merchant';
import { AdminModule } from './admin';
import { StoreModule } from './store';
import { CouponModule } from './coupon';
import { CampaignModule } from './campaign';
import { EventsModule } from './events';
import { AdminSettingsModule } from './admin-settings';
import { UploadsController } from './uploads.controller';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { ok: true, service: 'holicgem-api', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    MembershipModule,
    DropsModule,
    BenefitsModule,
    OrdersModule,
    ScanModule,
    MerchantModule,
    AdminModule,
    StoreModule,
    CouponModule,
    CampaignModule,
    EventsModule,
    AdminSettingsModule,
  ],
  controllers: [HealthController, UploadsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: I18nInterceptor }],
})
export class AppModule {}
