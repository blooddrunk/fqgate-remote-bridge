import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import type {
  CloudflareApiClientOptions,
  CloudflareDiscoveryClient,
  CloudflareGetTransport,
} from "./types.js";

const DEFAULT_MAX_PAGES = 32;
const DEFAULT_MAX_ITEMS = 1_024;
const DEFAULT_PAGE_SIZE = 50;

interface PageResult {
  readonly items: readonly unknown[];
  readonly totalPages: number | null;
  readonly totalCount: number | null;
}

export class CloudflareApiClient implements CloudflareDiscoveryClient {
  private readonly transport: CloudflareGetTransport;
  private readonly maxPages: number;
  private readonly maxItems: number;

  constructor(options: CloudflareApiClientOptions) {
    this.transport = options.transport;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
    if (!Number.isSafeInteger(this.maxPages) || this.maxPages < 1 || this.maxPages > 128) {
      throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "Cloudflare API page limit is invalid");
    }
    if (!Number.isSafeInteger(this.maxItems) || this.maxItems < 1 || this.maxItems > 10_000) {
      throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "Cloudflare API item limit is invalid");
    }
  }

  listAccounts(): Promise<readonly unknown[]> {
    return this.listCollection("/accounts", "accounts");
  }

  async getAccount(accountId: string): Promise<unknown> {
    return this.getSingle(`/accounts/${encodePathSegment(accountId)}`, "account");
  }

  listZones(accountId: string): Promise<readonly unknown[]> {
    return this.listCollection("/zones", "zones", { "account.id": accountId });
  }

  listTunnels(accountId: string): Promise<readonly unknown[]> {
    return this.listCollection(`/accounts/${encodePathSegment(accountId)}/cfd_tunnel`, "tunnels");
  }

  async getTunnel(accountId: string, tunnelId: string): Promise<unknown> {
    return this.getSingle(
      `/accounts/${encodePathSegment(accountId)}/cfd_tunnel/${encodePathSegment(tunnelId)}`,
      "tunnel",
    );
  }

  async getTunnelConfiguration(accountId: string, tunnelId: string): Promise<unknown> {
    return this.getSingle(
      `/accounts/${encodePathSegment(accountId)}/cfd_tunnel/${encodePathSegment(tunnelId)}/configurations`,
      "tunnel configuration",
    );
  }

  listDnsRecords(zoneId: string, hostname: string): Promise<readonly unknown[]> {
    return this.listCollection(`/zones/${encodePathSegment(zoneId)}/dns_records`, "DNS records", {
      name: hostname,
    });
  }

  listAccessApplications(accountId: string): Promise<readonly unknown[]> {
    return this.listCollection(
      `/accounts/${encodePathSegment(accountId)}/access/apps`,
      "Access applications",
    );
  }

  listAccessPolicies(accountId: string, applicationId: string): Promise<readonly unknown[]> {
    return this.listCollection(
      `/accounts/${encodePathSegment(accountId)}/access/apps/${encodePathSegment(applicationId)}/policies`,
      "Access policies",
    );
  }

  private async listCollection(
    path: string,
    resource: string,
    filters: Readonly<Record<string, string>> = {},
  ): Promise<readonly unknown[]> {
    const items: unknown[] = [];
    let page = 1;
    while (page <= this.maxPages) {
      const pageResult = await this.getPage(path, resource, {
        ...filters,
        page: String(page),
        per_page: String(DEFAULT_PAGE_SIZE),
      });
      if (pageResult.totalCount !== null && pageResult.totalCount > this.maxItems) {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_PAGINATION_LIMIT,
          `Cloudflare ${resource} result set exceeds the bounded item limit`,
        );
      }
      if (items.length + pageResult.items.length > this.maxItems) {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_PAGINATION_LIMIT,
          `Cloudflare ${resource} result set exceeds the bounded item limit`,
        );
      }
      items.push(...pageResult.items);
      const hasNextPage =
        pageResult.totalPages === null
          ? pageResult.items.length >= DEFAULT_PAGE_SIZE
          : page < pageResult.totalPages;
      if (!hasNextPage) return items;
      page += 1;
    }
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_PAGINATION_LIMIT,
      `Cloudflare ${resource} pagination exceeded the bounded page limit`,
    );
  }

  private async getPage(
    path: string,
    resource: string,
    query: Readonly<Record<string, string>>,
  ): Promise<PageResult> {
    const response = await this.transport.get(path, query);
    const envelope = response.payload;
    if (!isRecord(envelope)) {
      throw invalidResponse(resource, "response envelope is not an object");
    }
    if (response.status < 200 || response.status >= 300 || envelope.success !== true) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
        `Cloudflare ${resource} GET was not successful`,
        {
          resource,
          status: response.status,
          errorCodes: boundedErrorCodes(envelope.errors),
        },
      );
    }
    if (!Array.isArray(envelope.result)) {
      throw invalidResponse(resource, "list result is not an array");
    }
    return {
      items: envelope.result,
      ...readPageInfo(envelope.result_info, resource),
    };
  }

  private async getSingle(path: string, resource: string): Promise<unknown> {
    const response = await this.transport.get(path);
    const envelope = response.payload;
    if (!isRecord(envelope)) {
      throw invalidResponse(resource, "response envelope is not an object");
    }
    if (response.status < 200 || response.status >= 300 || envelope.success !== true) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
        `Cloudflare ${resource} GET was not successful`,
        {
          resource,
          status: response.status,
          errorCodes: boundedErrorCodes(envelope.errors),
        },
      );
    }
    if (!isRecord(envelope) || !("result" in envelope)) {
      throw invalidResponse(resource, "single-resource result is missing");
    }
    return envelope.result;
  }
}

function readPageInfo(
  value: unknown,
  resource: string,
): Pick<PageResult, "totalPages" | "totalCount"> {
  if (value === undefined) return { totalPages: null, totalCount: null };
  if (!isRecord(value)) throw invalidResponse(resource, "result_info is not an object");
  const totalPages = readOptionalPositiveInteger(value.total_pages, `${resource}.total_pages`);
  const totalCount = readOptionalPositiveInteger(value.total_count, `${resource}.total_count`);
  return { totalPages, totalCount };
}

function readOptionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse(field, "pagination value is invalid");
  }
  return value;
}

function boundedErrorCodes(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return [];
  const codes: number[] = [];
  for (const item of value.slice(0, 8)) {
    if (isRecord(item) && typeof item.code === "number" && Number.isSafeInteger(item.code)) {
      codes.push(item.code);
    }
  }
  return codes;
}

function encodePathSegment(value: string): string {
  if (value.length === 0 || value.length > 128 || value.includes("/")) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
      "Cloudflare resource ID is invalid",
    );
  }
  return encodeURIComponent(value);
}

function invalidResponse(resource: string, reason: string): BridgeError {
  return new BridgeError(
    ERROR_CODES.CLOUDFLARE_API_RESPONSE_INVALID,
    `Cloudflare ${resource} response is invalid: ${reason}`,
    { resource },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
