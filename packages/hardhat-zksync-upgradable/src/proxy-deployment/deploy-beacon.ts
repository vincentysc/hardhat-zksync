import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { Deployment } from '@openzeppelin/upgrades-core';

import { ZkSyncArtifact } from '@matterlabs/hardhat-zksync-deploy/src/types';

import { DeployBeaconOptions } from '../utils/options';
import { deploy, DeployTransaction } from './deploy';
import * as zk from 'zksync-web3';
import { deployBeaconImpl } from './deploy-impl';
import { UPGRADABLE_BEACON_JSON } from '../constants';
import chalk from 'chalk';
import assert from 'assert';

export interface DeployBeaconFunction {
    (wallet: zk.Wallet, artifact: ZkSyncArtifact, opts?: DeployBeaconOptions): Promise<zk.Contract>;
}

export function makeDeployBeacon(hre: HardhatRuntimeEnvironment): DeployBeaconFunction {
    return async function deployBeacon(wallet: zk.Wallet, artifact: ZkSyncArtifact, opts: DeployBeaconOptions = {}) {
        const beaconImplFactory = new zk.ContractFactory(artifact.abi, artifact.bytecode, wallet);

        opts.provider = wallet.provider;
        const { impl } = await deployBeaconImpl(hre, beaconImplFactory, opts);
        console.info(chalk.green('Beacon impl deployed at', impl));

        const upgradableBeaconPaths = (await hre.artifacts.getArtifactPaths()).filter((x) =>
            x.includes(UPGRADABLE_BEACON_JSON)
        );
        assert(upgradableBeaconPaths.length == 1, 'Upgradable beacon artifact not found');
        const upgradeableBeaconContract = await import(upgradableBeaconPaths[0]);

        const upgradeableBeaconFactory = new zk.ContractFactory(
            upgradeableBeaconContract.abi,
            upgradeableBeaconContract.bytecode,
            wallet
        );
        const beaconDeployment: Required<Deployment & DeployTransaction> = await deploy(upgradeableBeaconFactory, impl);

        const beaconContract = upgradeableBeaconFactory.attach(beaconDeployment.address);
        // @ts-ignore Won't be readonly because beaconContract was created through attach.
        beaconContract.deployTransaction = beaconDeployment.deployTransaction;
        return beaconContract;
    };
}
