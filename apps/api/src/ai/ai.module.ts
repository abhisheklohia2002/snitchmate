import {Module} from '@nestjs/common';
import {AiController} from './ai.controller';
import {AiService} from './ai.service';
import {OpenAiProvider} from './providers/openai.provider';
import {Db} from '../core/db';
import {AuthService} from '../auth/auth.service';
import {MatchingService} from './services/matching.service';

@Module({controllers:[AiController],providers:[Db,AuthService,AiService,OpenAiProvider,MatchingService],exports:[AiService]})
export class AiModule {}
