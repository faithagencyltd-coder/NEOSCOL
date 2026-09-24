// Lien des portails (/acces/CODE) : identité publique uniquement, établissements actifs, compteurs protégés.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Lien des portails", () => {
  test("visiteur non connecté : identité publique seulement, code insensible à la casse", async () => {
    await as("anon", async (q) => {
      const rows = await q("select * from public.organization_portal(' demo ')");
      assert.equal(rows.length, 1);
      assert.deepEqual(Object.keys(rows[0]).sort(), [
        "city", "code", "country", "has_logo", "id", "is_demo", "name", "primary_color", "secondary_color", "short_name", "type",
      ]);
      assert.equal(rows[0].id, ORG_DEMO);
      assert.equal((await q("select * from public.organization_portal('INCONNU')")).length, 0);
      assert.equal((await q("select * from public.organization_portal_logo('DEMO')")).length, 0, "pas de logo configuré");
      // Aucune donnée privée accessible en direct.
      assert.match(await rejects(q("select id from public.organizations")), /permission denied/);
      assert.match(await rejects(q("select id from public.file_objects")), /permission denied/);
      assert.match(await rejects(q("select public.portal_account_counts($1)", [ORG_DEMO])), /permission/i);
    });
  });

  test("établissement suspendu : lien inactif", async () => {
    await as(null, async (q) => {
      await q("update public.organizations set status = 'suspended' where id = $1", [ORG_DEMOF]);
      const [{ code }] = await q("select code from public.organizations where id = $1", [ORG_DEMOF]);
      await q("set local role anon");
      assert.equal((await q("select * from public.organization_portal($1)", [code])).length, 0);
    });
  });

  test("logo : seul le fichier désigné comme logo, image uniquement", async () => {
    await as(null, async (q) => {
      const [{ id }] = await q(
        "insert into public.file_objects (organization_id, bucket, path, owner_type, owner_id, file_name, mime_type, size_bytes, content) values ($1, 'org-assets', $2, 'organization', $1, 'logo.png', 'image/png', 4, '\\x89504e47') returning id",
        [ORG_DEMO, `${ORG_DEMO}/logo-test.png`],
      );
      await q("update public.organization_branding set logo_path = $2 where organization_id = $1", [ORG_DEMO, id]);
      await q("set local role anon");
      const [logo] = await q("select mime_type, content from public.organization_portal_logo('demo')");
      assert.equal(logo.mime_type, "image/png");
      assert.equal(logo.content.length, 4);
      assert.equal((await q("select has_logo from public.organization_portal('DEMO')"))[0].has_logo, true);
      await switchTo(q, null);
      const [{ id: pdf }] = await q(
        "insert into public.file_objects (organization_id, bucket, path, owner_type, owner_id, file_name, mime_type, size_bytes, content) values ($1, 'org-assets', $2, 'organization', $1, 'logo.pdf', 'application/pdf', 4, '\\x25504446') returning id",
        [ORG_DEMO, `${ORG_DEMO}/logo-test.pdf`],
      );
      await q("update public.organization_branding set logo_path = $2 where organization_id = $1", [ORG_DEMO, pdf]);
      await q("set local role anon");
      assert.equal((await q("select * from public.organization_portal_logo('DEMO')")).length, 0, "un PDF n'est jamais servi");
    });
  });

  test("compteurs de comptes : réservés à settings.manage de l'établissement", async () => {
    await as(USERS.admin, async (q) => {
      const [{ c }] = await q("select public.portal_account_counts($1) as c", [ORG_DEMO]);
      assert.ok(c.parents >= 1 && c.students >= 1 && c.teachers >= 1 && c.staff >= 1);
      assert.match(await rejects(q("select public.portal_account_counts($1)", [ORG_DEMOF])), /settings\.manage/);
    });
    await as(USERS.teacher, async (q) => {
      assert.match(await rejects(q("select public.portal_account_counts($1)", [ORG_DEMO])), /settings\.manage/);
    });
  });
});
