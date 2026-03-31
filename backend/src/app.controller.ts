import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** GET /meals-rmg/api/health — avoid colliding with SPA under /meals-rmg/. */
  @Get('health')
  getHello(): string {
    return this.appService.getHello();
  }
}
