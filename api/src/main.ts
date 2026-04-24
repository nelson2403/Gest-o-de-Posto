import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin, callback) => {
      // Permite qualquer localhost em desenvolvimento
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else if (origin === process.env.FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(new Error('CORS bloqueado'));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Cartão de Desconto API')
    .setDescription('Sistema de gestão de preços e cartões RFID para postos')
    .setVersion('2.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.API_PORT || 3001);
  console.log(`API rodando em http://localhost:${process.env.API_PORT || 3001}`);
  console.log(`Docs em http://localhost:${process.env.API_PORT || 3001}/docs`);
}

bootstrap();
