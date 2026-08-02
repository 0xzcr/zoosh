export class ProviderConfigurationError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
    this.provider = provider;
  }
}

export class ProviderRequestError extends Error {
  readonly provider: string;
  readonly status: number;

  constructor(provider: string, status: number, message: string) {
    super(message);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.status = status;
  }
}
