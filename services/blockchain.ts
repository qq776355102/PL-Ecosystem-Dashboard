
import { ethers } from 'ethers';
import { 
    ERC20_ABI, 
    STAKE_ABI, 
    LONG_BONDS_ABI, 
    TURBINE_ABI, 
    ZHUWANG_ABI, 
    MULTICALL_CUSTOM_ABI,
    MULTICALL3_ABI,
    MULTICALL3_ADDRESS,
    TOTAL_STAKING_QUERY_CONTRACT,
    AIRDROP_A_ENERGY_STAKE_CONTRACTS,
    BOND_CONTRACT_ADDRESSES,
    TURBINE_ADDRESS,
    ZHUWANG_ADDRESS,
    LGNS_TOKEN,
    SLGNS_TOKEN
} from '../constants';
import { StakingData } from '../types';

let currentProvider: ethers.JsonRpcProvider | null = null;
let currentRpcUrl: string | null = null;

/**
 * Returns a cached provider or creates a new one if the URL changes.
 */
export function getProvider(rpcUrl: string): ethers.JsonRpcProvider {
    if (!currentProvider || currentRpcUrl !== rpcUrl) {
        try {
            currentProvider = new ethers.JsonRpcProvider(rpcUrl);
            currentRpcUrl = rpcUrl;
        } catch (error) {
            console.error("Failed to initialize provider:", error);
            // Fallback to default if provided URL is invalid
            currentProvider = new ethers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
            currentRpcUrl = "https://polygon-bor-rpc.publicnode.com";
        }
    }
    return currentProvider;
}

/**
 * Custom Total Staking Query via specific contract call
 */
async function queryTotalStaking(address: string, provider: ethers.JsonRpcProvider): Promise<bigint> {
    try {
        const userAddress_outwith0x = address.slice(2).toLowerCase();
        const callData = `0xffd7d741000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000099a57e6c8558bc6689f894e068733adf83c19725000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000247965d56d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000309ca717d6989676194b88fd06029a88ceefee6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000645ac983f400000000000000000000000099a57e6c8558bc6689f894e068733adf83c197250000000000000000000000001964ca90474b11ffd08af387b110ba6c96251bfc000000000000000000000000${userAddress_outwith0x}00000000000000000000000000000000000000000000000000000000`;
        const result = await provider.call({ to: TOTAL_STAKING_QUERY_CONTRACT, data: callData });
        if (result && result !== '0x') {
            const multicallInterface = new ethers.Interface(MULTICALL_CUSTOM_ABI);
            const decoded = multicallInterface.decodeFunctionResult('multiCall', result);
            const successes = decoded[0];
            const results = decoded[1];
            if (results.length > 1 && successes[1]) {
                return BigInt(results[1]);
            }
        }
    } catch (e) {
        console.warn("Total staking query failed:", e);
    }
    return 0n;
}

/**
 * Optimizes fetching of dynamic length staking data using Multicall3
 */
async function batchQueryDynamicDetails(
    address: string, 
    contracts: string[], 
    abi: string[], 
    countMethod: string, 
    itemMethod: string, 
    provider: ethers.JsonRpcProvider,
    resultExtractor: (decoded: any) => bigint
): Promise<bigint> {
    const multi = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    const iface = new ethers.Interface(abi);
    let total = 0n;

    // Step 1: Get all counts
    const countCalls = contracts.map(target => ({
        target,
        callData: iface.encodeFunctionData(countMethod, [address])
    }));

    try {
        const countsResults = await multi.tryAggregate.staticCall(false, countCalls);
        const itemCalls: {target: string, callData: string}[] = [];

        countsResults.forEach((res: any, idx: number) => {
            if (res.success) {
                const count = Number(iface.decodeFunctionResult(countMethod, res.returnData)[0]);
                for (let i = 0; i < count; i++) {
                    itemCalls.push({
                        target: contracts[idx],
                        callData: iface.encodeFunctionData(itemMethod, [address, i])
                    });
                }
            }
        });

        if (itemCalls.length === 0) return 0n;

        // Step 2: Fetch all items in chunks if too many to avoid gas limits
        const CHUNK_SIZE = 50;
        for (let i = 0; i < itemCalls.length; i += CHUNK_SIZE) {
            const chunk = itemCalls.slice(i, i + CHUNK_SIZE);
            const itemsResults = await multi.tryAggregate.staticCall(false, chunk);
            itemsResults.forEach((res: any) => {
                if (res.success) {
                    const decoded = iface.decodeFunctionResult(itemMethod, res.returnData);
                    total += resultExtractor(decoded);
                }
            });
        }
    } catch (e) {
        console.error(`Dynamic query failed for ${address}:`, e);
    }

    return total;
}

/**
 * Optimized query function using Multicall3 for all simple calls
 */
export async function queryAddressFullData(
    aAddress: string, 
    derivedAddress: string, 
    rpcUrl: string
): Promise<StakingData> {
    const provider = getProvider(rpcUrl);
    const multi = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    const turbineIface = new ethers.Interface(TURBINE_ABI);
    const zhuwangIface = new ethers.Interface(ZHUWANG_ABI);

    // Simple calls that don't depend on counts
    const simpleCalls = [
        { target: TURBINE_ADDRESS, callData: turbineIface.encodeFunctionData('getTurbineBal', [aAddress]) },
        { target: ZHUWANG_ADDRESS, callData: zhuwangIface.encodeFunctionData('claimable', [aAddress]) },
        { target: LGNS_TOKEN.address, callData: erc20Iface.encodeFunctionData('balanceOf', [derivedAddress]) },
        { target: SLGNS_TOKEN.address, callData: erc20Iface.encodeFunctionData('balanceOf', [derivedAddress]) }
    ];

    try {
        const [simpleResults, totalStaking, mintStaked, bondStaked] = await Promise.all([
            multi.tryAggregate.staticCall(false, simpleCalls),
            queryTotalStaking(aAddress, provider),
            batchQueryDynamicDetails(
                aAddress, 
                AIRDROP_A_ENERGY_STAKE_CONTRACTS, 
                STAKE_ABI, 
                'getUserStakesCount', 
                'stakes', 
                provider,
                (decoded) => decoded.exists ? BigInt(decoded.principal) : 0n
            ),
            batchQueryDynamicDetails(
                aAddress, 
                BOND_CONTRACT_ADDRESSES, 
                LONG_BONDS_ABI, 
                'getBondInfoDataLength', 
                'bondInfoData', 
                provider,
                (decoded) => decoded.bond && decoded.bond.owner !== ethers.ZeroAddress ? BigInt(decoded.bond.payout) : 0n
            )
        ]);

        return {
            totalStaking,
            airdropEnergyStaking: mintStaked,
            bondStaking: bondStaked,
            turbineBalance: simpleResults[0].success ? BigInt(turbineIface.decodeFunctionResult('getTurbineBal', simpleResults[0].returnData)[0]) : 0n,
            zhuwangReward: simpleResults[1].success ? BigInt(zhuwangIface.decodeFunctionResult('claimable', simpleResults[1].returnData)[0]) : 0n,
            lgnsBalance: simpleResults[2].success ? BigInt(erc20Iface.decodeFunctionResult('balanceOf', simpleResults[2].returnData)[0]) : 0n,
            slgnsBalance: simpleResults[3].success ? BigInt(erc20Iface.decodeFunctionResult('balanceOf', simpleResults[3].returnData)[0]) : 0n,
        };
    } catch (error) {
        console.error("Full data query failed:", error);
        throw error;
    }
}

export function formatUnits(value: bigint | string | undefined, decimals: number = 9): string {
    if (value === undefined || value === "" || value === null) return "0.00";
    try {
        return ethers.formatUnits(BigInt(value), decimals);
    } catch (e) {
        return "0.00";
    }
}
