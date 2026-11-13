import { Module } from '@nestjs/common';
import { GigsController } from './gigs/gigs.controller';
import { DeliveryPartnersController } from './delivery/delivery-partners.controller';
import { Db } from './core/db';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { MarketplaceController } from './marketplace/marketplace.controller';
import { MediaController } from './media/media.controller';
import { OrdersService } from './orders/orders.service';
import { OrdersController } from './orders/orders.controller';
import { PaymentsController } from './payments/payments.controller';
import { LogisticsController } from './logistics/logistics.controller';
import { OperationsController } from './operations/operations.controller';
@Module({controllers:[GigsController,DeliveryPartnersController,AuthController,MarketplaceController,MediaController,OrdersController,PaymentsController,LogisticsController,OperationsController],providers:[Db,AuthService,OrdersService]})
export class AppModule{}
