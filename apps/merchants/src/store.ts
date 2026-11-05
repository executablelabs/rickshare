import { Database } from "bun:sqlite";
import { SignedQuote } from "@rickshare/shared";
import { getAddress } from "viem";

export type DeliveryJob = {
  scope: string;
  vault: string;
  proposal_id: string;
  attempts: number;
  next_attempt: number;
  status: string;
};
export type TicketRecord = {
  id: string;
  vault: string;
  proposal_id: string;
  payload: string;
  hash: string;
  status: string;
};

export class MerchantStore {
  readonly sqlite: Database;

  constructor(path: string) {
    this.sqlite = new Database(path, { create: true });
    this.sqlite.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS quotes (hash TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cursors (scope TEXT PRIMARY KEY, block TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vaults (scope TEXT NOT NULL, address TEXT NOT NULL, PRIMARY KEY(scope,address));
      CREATE TABLE IF NOT EXISTS delivery_jobs (scope TEXT NOT NULL, vault TEXT NOT NULL, proposal_id TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'queued',
        error_code TEXT, PRIMARY KEY(scope,vault,proposal_id));
      CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, vault TEXT NOT NULL, proposal_id TEXT NOT NULL,
        payload TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared', UNIQUE(vault,proposal_id));`);
  }

  saveQuote(quote: SignedQuote) {
    this.sqlite
      .query("INSERT INTO quotes(hash,payload) VALUES(?,?)")
      .run(quote.quoteHash.toLowerCase(), JSON.stringify(quote));
  }
  quote(hash: string) {
    const row = this.sqlite
      .query<{ payload: string }, [string]>("SELECT payload FROM quotes WHERE hash=?")
      .get(hash.toLowerCase());
    return row ? SignedQuote.parse(JSON.parse(row.payload)) : null;
  }
  cursor(scope: string) {
    return this.sqlite
      .query<{ block: string; hash: string }, [string]>(
        "SELECT block,hash FROM cursors WHERE scope=?",
      )
      .get(scope);
  }
  vaults(scope: string) {
    return this.sqlite
      .query<{ address: string }, [string]>("SELECT address FROM vaults WHERE scope=?")
      .all(scope)
      .map((row) => getAddress(row.address));
  }

  commitScan(
    scope: string,
    block: bigint,
    hash: string,
    vaults: string[],
    jobs: { vault: string; proposalId: string }[],
  ) {
    this.sqlite.transaction(() => {
      for (const address of vaults)
        this.sqlite
          .query("INSERT OR IGNORE INTO vaults(scope,address) VALUES(?,?)")
          .run(scope, address.toLowerCase());
      for (const job of jobs)
        this.sqlite
          .query("INSERT OR IGNORE INTO delivery_jobs(scope,vault,proposal_id) VALUES(?,?,?)")
          .run(scope, job.vault.toLowerCase(), job.proposalId);
      this.sqlite
        .query(
          "INSERT INTO cursors(scope,block,hash) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET block=excluded.block,hash=excluded.hash",
        )
        .run(scope, block.toString(), hash);
    })();
  }

  jobs(scope: string, now: number) {
    return this.sqlite
      .query<DeliveryJob, [string, number]>(
        "SELECT * FROM delivery_jobs WHERE scope=? AND status='queued' AND next_attempt<=? ORDER BY next_attempt LIMIT 20",
      )
      .all(scope, now);
  }
  complete(scope: string, vault: string, id: string) {
    this.sqlite
      .query(
        "UPDATE delivery_jobs SET status='complete' WHERE scope=? AND vault=? AND proposal_id=?",
      )
      .run(scope, vault.toLowerCase(), id);
  }
  retry(job: DeliveryJob, now: number, code: string) {
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(job.attempts, 6));
    this.sqlite
      .query(
        "UPDATE delivery_jobs SET attempts=attempts+1,next_attempt=?,error_code=? WHERE scope=? AND vault=? AND proposal_id=?",
      )
      .run(now + delay, code, job.scope, job.vault, job.proposal_id);
  }

  prepare(record: Omit<TicketRecord, "status">): TicketRecord {
    this.sqlite
      .query("INSERT OR IGNORE INTO tickets(id,vault,proposal_id,payload,hash) VALUES(?,?,?,?,?)")
      .run(record.id, record.vault.toLowerCase(), record.proposal_id, record.payload, record.hash);
    const saved = this.ticketFor(record.vault, record.proposal_id);
    if (!saved) throw new Error("Ticket could not be persisted");
    return saved;
  }
  issued(vault: string, id: string) {
    this.sqlite
      .query("UPDATE tickets SET status='issued' WHERE vault=? AND proposal_id=?")
      .run(vault.toLowerCase(), id);
  }
  ticketFor(vault: string, id: string) {
    return this.sqlite
      .query<TicketRecord, [string, string]>(
        "SELECT * FROM tickets WHERE vault=? AND proposal_id=?",
      )
      .get(vault.toLowerCase(), id);
  }
  ticket(id: string) {
    return this.sqlite
      .query<TicketRecord, [string]>("SELECT * FROM tickets WHERE id=? AND status='issued'")
      .get(id);
  }
  close() {
    this.sqlite.close();
  }
}
