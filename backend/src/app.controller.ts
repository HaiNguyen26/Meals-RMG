import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Use /meals-rmg/ (SPA) for the app; keep a simple probe that is not the SPA wildcard. */
  @Get('health')
  getHello(): string {
    return this.appService.getHello();
  }
}
