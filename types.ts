
export interface AddressInfo {
  aAddress: string;
  derivedAddress: string;
  remark: string;
  log: string;
  split?: string;
  // Dynamic fields populated by query
  totalStaking?: string;
  airdropEnergyStaking?: string;
  bondStaking?: string;
  zhuwangReward?: string;
  turbineBalance?: string;
  lgnsBalance?: string;
  slgnsBalance?: string;
  lastUpdated?: number;
}

export interface StakingData {
  totalStaking: bigint;
  airdropEnergyStaking: bigint;
  bondStaking: bigint;
  zhuwangReward: bigint;
  turbineBalance: bigint;
  lgnsBalance: bigint;
  slgnsBalance: bigint;
}

export interface BatchQueryResult {
  address: string;
  data: StakingData;
  success: boolean;
}

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
}
