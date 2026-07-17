export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  ssl: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  database: DatabaseConfig;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'phoenix',
    password: process.env.DB_PASSWORD ?? 'phoenix',
    name: process.env.DB_NAME ?? 'phoenix_orders',
    ssl: process.env.DB_SSL === 'true',
  },
});
