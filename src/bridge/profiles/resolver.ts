import type { OfflineProfileRegistry } from "./registry.js";
import { ALIAS, OPERATIONS, deny, exact, frozen, observation, same, text } from "./types.js";
import type {
  AuthorityPort,
  ClockPort,
  ProfileLease,
  ProfileOperation,
  ProfileRequest,
  Registration,
  Scope,
  SourceEvidence,
  SyntheticTarget,
} from "./types.js";

interface LeaseRecord {
  readonly boot: object;
  readonly bootNonce: string;
  readonly registration: Registration;
  readonly revision: number;
  readonly generation: number;
  readonly deploymentGeneration: number;
  readonly operation: ProfileOperation;
  readonly authority: object;
  readonly scope: Scope;
  readonly deadline: number;
  readonly target: SyntheticTarget;
}

/** One private selection authority for all four synthetic operations. No I/O implementation. */
export class OfflineProfileResolver {
  #boot = Object.freeze({});
  #leases = new WeakMap<object, LeaseRecord>();
  #deploymentGeneration = 1;
  #lastTime = 0;
  constructor(
    readonly registry: OfflineProfileRegistry,
    private readonly options: {
      readonly bootNonce: string;
      readonly authority: AuthorityPort;
      readonly clock: ClockPort;
      readonly observe: () => Promise<unknown>;
    },
  ) {
    if (!/^[a-f0-9]{32}$/.test(options.bootNonce)) deny("CONFIG_INVALID");
  }
  now(): number {
    const now = this.options.clock.now();
    if (!Number.isSafeInteger(now) || now < this.#lastTime) {
      this.invalidateDeployment();
      deny("PROFILE_STALE");
    }
    this.#lastTime = now;
    return now;
  }
  async within<T>(work: Promise<T>, deadline: number): Promise<T> {
    try {
      const result = await this.options.clock.within(work, deadline);
      if (this.now() >= deadline) deny("TIMEOUT");
      return result;
    } catch {
      if (this.now() >= deadline) deny("TIMEOUT");
      deny("PROFILE_UNAVAILABLE");
    }
  }
  #scope(authority: object): Scope {
    const scope = this.options.authority.verify(authority);
    if (
      !scope ||
      scope.context !== "local" ||
      !text(scope.principal) ||
      !text(scope.audience) ||
      !text(scope.deployment) ||
      !Number.isSafeInteger(scope.policyRevision) ||
      scope.policyRevision < 1
    )
      deny("PROFILE_DENIED");
    return Object.freeze({
      context: scope.context,
      principal: scope.principal,
      audience: scope.audience,
      deployment: scope.deployment,
      policyRevision: scope.policyRevision,
    });
  }
  #assert(record: LeaseRecord): void {
    const scope = this.#scope(record.authority);
    if (
      !same(scope, record.scope) ||
      !this.options.authority.allows(scope, record.registration.alias, record.operation)
    )
      deny("PROFILE_STALE");
    if (
      record.boot !== this.#boot ||
      record.bootNonce !== this.options.bootNonce ||
      record.revision !== this.registry.revision ||
      record.generation !== this.registry.generation(record.registration.alias) ||
      record.deploymentGeneration !== this.#deploymentGeneration ||
      this.registry.get(record.registration.alias) !== record.registration ||
      !record.registration.enabled
    )
      deny("PROFILE_STALE");
    if (this.now() >= record.deadline) deny("TIMEOUT");
  }
  #record(lease: ProfileLease): LeaseRecord {
    if (!lease || typeof lease !== "object") deny("PROFILE_DENIED");
    const record = this.#leases.get(lease);
    if (!record) deny("PROFILE_DENIED");
    this.#assert(record);
    return record;
  }
  async resolve(input: ProfileRequest): Promise<ProfileLease> {
    const request = exact(input, ["alias", "operation", "authority"]);
    if (
      !OPERATIONS.includes(request.operation as ProfileOperation) ||
      !request.authority ||
      typeof request.authority !== "object"
    )
      deny("INPUT_INVALID");
    const operation = request.operation as ProfileOperation;
    const authority = request.authority;
    const scope = this.#scope(authority);
    if (
      request.alias !== undefined &&
      (typeof request.alias !== "string" || !ALIAS.test(request.alias))
    )
      deny("INPUT_INVALID");
    const alias = (request.alias as string | undefined) ?? this.registry.defaultAlias;
    if (!alias) deny("PROFILE_SELECTION_REQUIRED");
    const registration = this.registry.get(alias);
    if (!registration?.enabled || !this.options.authority.allows(scope, alias, operation))
      deny("PROFILE_DENIED");
    const deadline = this.now() + 5_000;
    const revision = this.registry.revision,
      generation = this.registry.generation(alias),
      deploymentGeneration = this.#deploymentGeneration;
    const observed = await this.#observe(deadline, alias);
    // No await between this check and creating the opaque capability.
    if (
      !same(scope, this.#scope(authority)) ||
      !this.options.authority.allows(scope, alias, operation) ||
      revision !== this.registry.revision ||
      generation !== this.registry.generation(alias) ||
      deploymentGeneration !== this.#deploymentGeneration ||
      registration !== this.registry.get(alias)
    )
      deny("PROFILE_STALE");
    const source = this.#match(registration, observed, operation);
    const lease = Object.freeze(Object.create(null)) as ProfileLease;
    const target = frozen({ lease, source });
    this.#leases.set(lease, {
      boot: this.#boot,
      bootNonce: this.options.bootNonce,
      registration,
      revision,
      generation,
      deploymentGeneration,
      operation,
      authority,
      scope,
      deadline,
      target,
    });
    return lease;
  }
  async #observe(deadline: number, alias: string): Promise<ReturnType<typeof observation>> {
    try {
      return observation(await this.within(this.options.observe(), deadline));
    } catch {
      this.registry.invalidate(alias);
      if (this.now() >= deadline) deny("TIMEOUT");
      deny("PROFILE_UNAVAILABLE");
    }
  }
  #match(
    registration: Registration,
    observed: ReturnType<typeof observation>,
    operation: ProfileOperation,
  ): SourceEvidence {
    const alias = registration.alias;
    if (!same(observed.process, registration.process)) {
      this.invalidateDeployment();
      deny("PROFILE_STALE");
    }
    const source = observed.sources.find((s) => s.id === registration.source.id);
    if (!source) {
      this.registry.invalidate(alias);
      deny("PROFILE_UNAVAILABLE");
    }
    const bound = registration.source;
    if (
      source.id !== bound.id ||
      source.number !== bound.number ||
      source.provider !== bound.provider ||
      !source.worker.ready ||
      !same(source.worker, bound.worker)
    ) {
      this.registry.invalidate(alias);
      deny("PROFILE_STALE");
    }
    const account = source.account;
    if (
      account.connected &&
      (!account.token ||
        observed.sources.filter((s) => s.account.connected && s.account.token === account.token)
          .length !== 1)
    ) {
      this.registry.invalidate(alias);
      deny("IDENTITY_UNPROVEN");
    }
    if (!bound.account.connected && account.connected) {
      // Stage only inside this call. Even expected-token completion needs explicit enrollment.
      this.registry.invalidate(alias);
      deny("ENROLLMENT_REQUIRED");
    }
    if (
      !same(account, bound.account) ||
      (account.connected && account.token !== registration.expectedAccount)
    ) {
      this.registry.invalidate(alias);
      deny("PROFILE_STALE");
    }
    if (operation === "lookup" && !account.connected) deny("LOGIN_REQUIRED");
    if (
      (operation === "qr.begin" || operation === "qr.poll") &&
      observed.sources.some((s) => s.id !== source.id && s.account.connected)
    )
      deny("PROFILE_UNAVAILABLE");
    return source;
  }
  async validate(lease: ProfileLease): Promise<void> {
    const record = this.#record(lease);
    const observed = await this.#observe(record.deadline, record.registration.alias);
    this.#assert(record);
    const source = this.#match(record.registration, observed, record.operation);
    if (!same(source, record.target.source)) {
      this.registry.invalidate(record.registration.alias);
      deny("PROFILE_STALE");
    }
  }
  /** Synchronous pre-effect gate; caller cannot change operation or private target. */
  effect<T>(
    lease: ProfileLease,
    operation: ProfileOperation,
    call: (target: SyntheticTarget) => T,
  ): T {
    const record = this.#record(lease);
    if (record.operation !== operation) deny("PROFILE_DENIED");
    return call(record.target);
  }
  /** Same-turn commit. The callback must be synchronous and never publish before this gate. */
  commit<T>(lease: ProfileLease, publish: () => T): T {
    this.#record(lease);
    return publish();
  }
  deadline(lease: ProfileLease): number {
    return this.#record(lease).deadline;
  }
  owner(lease: ProfileLease): string {
    const r = this.#record(lease);
    return JSON.stringify([
      r.bootNonce,
      r.registration.alias,
      r.registration.revision,
      r.generation,
      r.scope,
    ]);
  }
  invalidateDeployment(): void {
    this.#deploymentGeneration++;
    // Authentication effects between native sources are unproven: fence every pending result.
    this.registry.invalidateAll();
  }
  fenceAuthentication(lease: ProfileLease): void {
    const record = this.#record(lease);
    this.#deploymentGeneration++;
    this.#leases.set(lease, { ...record, deploymentGeneration: this.#deploymentGeneration });
  }
  epochGuarantee(): "LIVE_SESSION_EPOCH_UNPROVEN" {
    return "LIVE_SESSION_EPOCH_UNPROVEN";
  }
}
