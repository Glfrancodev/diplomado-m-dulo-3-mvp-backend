import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1784131114290 implements MigrationInterface {
  name = 'InitSchema1784131114290';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "description" character varying(500), "price" numeric(12,2) NOT NULL, "stock" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff39b9ac40872b2de41751eedc" ON "products"  ("isActive") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_63fcb3d8806a6efd53dbc67430" ON "products"  ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "productId" uuid NOT NULL, "amount" integer NOT NULL, "unitPrice" numeric(12,2) NOT NULL, "subTotal" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3e59f094c2dc3310d585216a813" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "customerId" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "total" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e5de51ca888d8b1f5ac25799dd" ON "orders"  ("customerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_775c9f06fc27ae3ff8fb26f2c4" ON "orders"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1f4b9818a08b822a31493fdee9" ON "orders"  ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying(150) NOT NULL, "email" character varying(180) NOT NULL, "phone" character varying(30), "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8536b8b85c06969f84f0c098b03" UNIQUE ("email"), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40946e98ab87148f58703fa1c5" ON "customers"  ("isActive") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2cf358083303634803f1dfb763" ON "customers"  ("createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "order_products" ADD CONSTRAINT "FK_28b66449cf7cd76444378ad4e92" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_products" ADD CONSTRAINT "FK_27ca18f2453639a1cafb7404ece" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_products" DROP CONSTRAINT "FK_27ca18f2453639a1cafb7404ece"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_products" DROP CONSTRAINT "FK_28b66449cf7cd76444378ad4e92"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2cf358083303634803f1dfb763"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_40946e98ab87148f58703fa1c5"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1f4b9818a08b822a31493fdee9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_775c9f06fc27ae3ff8fb26f2c4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e5de51ca888d8b1f5ac25799dd"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "order_products"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_63fcb3d8806a6efd53dbc67430"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff39b9ac40872b2de41751eedc"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
  }
}
