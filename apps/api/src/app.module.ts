import { Controller, Get, Module } from '@nestjs/common';
import { AuthModule } from './auth';
import { CatalogModule } from './catalog';
import { MembershipModule } from './membership';
import { DropsModule } from './drops';
import { BenefitsModule } from './benefits';
import { OrdersModule } from './orders';
import { ScanModule } from './scan';
import { MerchantModule } from './merchant';
import { AdminModule } from './admin';

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
