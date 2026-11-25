import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const folder = path.join(import.meta.dirname, "..", "..", "drizzle");
const journal: { entries: { tag: string }[] } = JSON.parse(
  fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"),
);
const pg = new PGlite();

// What a hosted database gives its owner: it may create roles and skip row
// level security, but it is not a superuser.
beforeAll(async () => {
  await pg.exec(`
    create role app_owner login createrole createdb bypassrls nosuperuser;
    alter schema public owner to app_owner;
    set session authorization app_owner;
  `);
  for (const { tag } of journal.entries) {
    await pg.exec(fs.readFileSync(path.join(folder, `${tag}.sql`), "utf8"));
  }
});
afterAll(() => pg.close());

describe("migrations run by a hosted database's owner", () => {
  it("are not run by a superuser here", async () => {
    const { rows } = await pg.query("select usesuper from pg_user where usename = current_user");
    expect(rows).toEqual([{ usesuper: false }]);
  });

  it("leave the owner able to act as one user, and that user apart from others", async () => {
    const users: string[] = [];
    for (const email of ["a@example.test", "b@example.test"]) {
      const { rows } = await pg.query<{ id: string }>("insert into users (name, email) values ('x', $1) returning id", [email]);
      users.push(rows[0]!.id);
      await pg.query("insert into clients (user_id, name) values ($1, 'Client')", [rows[0]!.id]);
    }
    const seen = await pg.transaction(async (tx) => {
      await tx.query("select set_config('app.current_user_id', $1, true)", [users[0]]);
      await tx.exec("set local role taxpilot_app");
      return tx.query("select user_id from clients");
    });
    expect(seen.rows).toEqual([{ user_id: users[0] }]);
    expect((await pg.query("select current_user::text as name")).rows).toEqual([{ name: "app_owner" }]);
  });

  it("protect every table that holds a user's data", async () => {
    const { rows } = await pg.query<{ name: string; protected: boolean }>(`
      select c.relname as name, c.relrowsecurity as protected
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)
      order by 1`);
    // Sign-in data: the app's own role has no access to these at all.
    const closed = ["accounts", "sessions"];
    expect(rows.filter((row) => !row.protected).map((row) => row.name)).toEqual(closed);
    for (const name of closed) {
      const { rows: access } = await pg.query(
        "select has_table_privilege('taxpilot_app', $1, 'select, insert, update, delete') as any",
        [name],
      );
      expect(access).toEqual([{ any: false }]);
    }
  });
});
