import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as zk from 'zksync-web3';
import * as ethers from 'ethers';
import chalk from 'chalk';
import assert from 'assert';
import path from 'path';
import { ZkSyncArtifact } from '@matterlabs/hardhat-zksync-deploy/src/types';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';

import { ZkSyncUpgradablePluginError } from '../errors';
import { DeployProxyOptions } from '../utils/options';
import { convertGasPriceToEth, getInitializerData } from '../utils/utils-general';
import { getChainId } from '../core/provider';
import { ERC1967_PROXY_JSON, TUP_JSON, defaultImplAddresses } from '../constants';

import { getAdminArtifact, getAdminFactory } from '../proxy-deployment/deploy-proxy-admin';
import { deploy } from '../proxy-deployment/deploy';

export interface EstimateProxyGasFunction {
    (deployer: Deployer, artifact: ZkSyncArtifact, args?: DeployProxyOptions[], opts?: DeployProxyOptions): Promise<ethers.BigNumber>;
}
interface GasCosts {
    adminGasCost: ethers.BigNumber;
    proxyGasCost: ethers.BigNumber;
}

async function deployProxyAdminLocally(
    adminFactory: zk.ContractFactory,
) {
    const mockContract = await deploy(adminFactory);
    return mockContract.address;
}

export function makeEstimateGasProxy(hre: HardhatRuntimeEnvironment): EstimateProxyGasFunction {
    return async function estimateGasProxy(
        deployer: Deployer,
        artifact: ZkSyncArtifact,
        args: DeployProxyOptions[] = [],
        opts: DeployProxyOptions = {}
    ) {
        let data;
        let totalGasCost;
        let mockImplAddress: string;

        const mockArtifact = await getAdminArtifact(hre);
        const kind = opts.kind;

        const chainId = await getChainId(deployer.zkWallet.provider);

        if (!chainId) {
            throw new ZkSyncUpgradablePluginError(`Chain id ${chainId} is not supported!`);
        }
        if (chainId == 270) {
            const adminFactory = await getAdminFactory(hre, deployer.zkWallet);
            mockImplAddress = await deployProxyAdminLocally(adminFactory);
            data = getInitializerData(adminFactory.interface, args, opts.initializer);
        } else {
            mockImplAddress = defaultImplAddresses[chainId].contractAddress;
            data = getInitializerData(ethers.Contract.getInterface(mockArtifact.abi), args, opts.initializer);
        }

        const implGasCost = await deployer.estimateDeployFee(artifact, []);
        console.info(
            chalk.cyan(
                `Deployment of the implementation contract is estimated to cost: ${convertGasPriceToEth(
                    implGasCost
                )} ETH`
            )
        );

        switch (kind) {
            case 'beacon': {
                throw new ZkSyncUpgradablePluginError(`Beacon proxy is not supported!`);
            }

            case 'uups': {
                const uupsGasCost = await estimateGasUUPS(hre, deployer, mockImplAddress, data);
                totalGasCost = implGasCost.add(uupsGasCost);
                break;
            }

            case 'transparent': {
                const { adminGasCost, proxyGasCost } = await estimateGasTransparent(
                    hre,
                    deployer,
                    mockImplAddress,
                    data
                );
                totalGasCost = implGasCost.add(adminGasCost).add(proxyGasCost);
                break;
            }

            default: {
                throw new ZkSyncUpgradablePluginError(`Unknown proxy kind: ${kind}`);
            }
        }

        console.info(
            chalk.cyan(`Total deployment cost is estimated to cost: ${convertGasPriceToEth(totalGasCost)} ETH`)
        );
        return totalGasCost;
    };
}

async function estimateGasUUPS(
    hre: HardhatRuntimeEnvironment,
    deployer: Deployer,
    mockImplAddress: string,
    data: string
): Promise<ethers.BigNumber> {
    const ERC1967ProxyPath = (await hre.artifacts.getArtifactPaths()).find((x) =>
        x.includes(path.sep + ERC1967_PROXY_JSON)
    );
    assert(ERC1967ProxyPath, 'ERC1967Proxy artifact not found');
    const proxyContract = await import(ERC1967ProxyPath);

    try {
        const uupsGasCost = await deployer.estimateDeployFee(proxyContract, [mockImplAddress, data]);
        console.info(
            chalk.cyan(
                `Deployment of the UUPS proxy contract is estimated to cost: ${convertGasPriceToEth(uupsGasCost)} ETH`
            )
        );
        return uupsGasCost;
    } catch (error: any) {
        throw new ZkSyncUpgradablePluginError(`Error estimating gas cost: ${error.reason}`);
    }
}

async function estimateGasTransparent(
    hre: HardhatRuntimeEnvironment,
    deployer: Deployer,
    mockImplAddress: string,
    data: string
): Promise<GasCosts> {
    const adminArtifact = await getAdminArtifact(hre);
    const adminGasCost = await deployer.estimateDeployFee(adminArtifact, []);
    let proxyGasCost;
    console.info(
        chalk.cyan(
            `Deployment of the admin proxy contract is estimated to cost: ${convertGasPriceToEth(adminGasCost)} ETH`
        )
    );

    const TUPPath = (await hre.artifacts.getArtifactPaths()).find((x) => x.includes(path.sep + TUP_JSON));
    assert(TUPPath, 'TUP artifact not found');
    const TUPContract = await import(TUPPath);

    try {
        proxyGasCost = await deployer.estimateDeployFee(TUPContract, [mockImplAddress, mockImplAddress, data]);
        console.info(
            chalk.cyan(
                `Deployment of the transparent proxy contract is estimated to cost: ${convertGasPriceToEth(
                    proxyGasCost
                )} ETH`
            )
        );
    } catch (error: any) {
        throw new ZkSyncUpgradablePluginError(`Error estimating gas cost: ${error.reason}`);
    }

    return { adminGasCost: adminGasCost, proxyGasCost: proxyGasCost };
}
