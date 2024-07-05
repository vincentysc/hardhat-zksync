import axios from 'axios';

import { ZkSyncVerifyPluginError } from '../errors';
import { handleAxiosError } from '../utils';
import { VerificationStatusResponse } from './verification-status-response';
import { ZkSyncBlockExplorerVerifyRequest } from './verify-contract-request';

export class ZkSyncBlockExplorerResponse {
    public readonly status: number;
    public readonly message: string;

    constructor(response: any) {
        this.status = parseInt(response.status, 10);
        this.message = response.data;
    }

    public isOk() {
        return this.status === 200;
    }
}

export async function checkVerificationStatusService(
    requestId: number,
    verifyURL: string,
    apikey: string,
): Promise<VerificationStatusResponse> {
    let verificationStatusResponse;

    try {
        const params: any = {};
        if (apikey !== '') {
            params.apikey = apikey;
        }

        const data = await axios.get(`${verifyURL}/${requestId}`, { params });
        verificationStatusResponse = new VerificationStatusResponse(data);

        return verificationStatusResponse;
    } catch (error) {
        handleAxiosError(error);
    }
}

export async function verifyContractRequest(
    req: ZkSyncBlockExplorerVerifyRequest,
    verifyURL: string,
    apikey: string,
): Promise<ZkSyncBlockExplorerResponse> {
    let data;
    try {
        const params: any = {};
        if (apikey !== '') {
            params.apikey = apikey;
        }

        data = await axios.post(verifyURL, req, { headers: { 'Content-Type': 'application/json' }, params });

        const zkSyncBlockExplorerResponse = new ZkSyncBlockExplorerResponse(data);

        if (!zkSyncBlockExplorerResponse.isOk()) {
            throw new ZkSyncVerifyPluginError(zkSyncBlockExplorerResponse.message);
        }

        return zkSyncBlockExplorerResponse;
    } catch (error) {
        handleAxiosError(error);
    }
}

export async function getSupportedCompilerVersions(
    verifyURL: string | undefined,
    apikey: string | undefined,
): Promise<string[]> {
    try {
        const params: any = {};
        if (apikey !== undefined && apikey !== '') {
            params.apikey = apikey;
        }

        const response = await axios.get(`${verifyURL}/solc_versions`, { params });
        return response.data;
    } catch (error) {
        handleAxiosError(error);
    }
}
