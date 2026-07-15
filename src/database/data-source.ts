import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'phoenix',
  password: process.env.DB_PASSWORD ?? 'phoenix',
  database: process.env.DB_NAME ?? 'phoenix_orders',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
