import * as smoldot from 'smoldot';
import mainnet from './nodle-mainnet.json';
import testnet from './nodle-testnet.json';
import polkadot from './polkadot.json';
import rococo from './connector/specs/rococo_v2_2.json';

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  callback?: (response: string) => void;
  id: number;
}

interface BatchJsonRpcOptions {
  maxBatchSize?: number;
  batchInterval?: number;
  testnet?: boolean;
}

class BatchJsonRpcClient {
  private options: BatchJsonRpcOptions;
  private batchQueue: JsonRpcRequest[];
  private sentRequests: JsonRpcRequest[] = [];
  private batchIntervalId?: ReturnType<typeof setTimeout>;
  client = smoldot.start({
    forbidTcp: true,
    forbidNonLocalWs: false,
    maxLogLevel: 9999999,
    cpuRateLimit: 0.5,
    logCallback: (level, target, message) => {
        if (level > 3)
            return;
        // The first parameter of the methods of `console` has some printf-like substitution
        // capabilities. We don't really need to use this, but not using it means that the logs
        // might not get printed correctly if they contain `%`.
        if (level <= 1) {
            console.error("[%s] %s", target, message);
        }
        else if (level === 2) {
            console.warn("[%s] %s", target, message);
        }
        else if (level === 3) {
            console.info("[%s] %s", target, message);
        }
        else if (level === 4) {
            console.debug("[%s] %s", target, message);
        }
        else {
            console.trace("[%s] %s", target, message);
        }
    },
  });
  private chain: smoldot.Chain | undefined;

  constructor(options: BatchJsonRpcOptions = {}) {
    (async () => {
      if (options.testnet) {
        
        const rococo_ = this.chain = await this.client.addChain({
          chainSpec: JSON.stringify(rococo)
        });
        this.chain = await this.client.addChain({
          chainSpec: JSON.stringify(testnet),
          potentialRelayChains: [rococo_]
        });
      } else {

        const polkadot_ = this.chain = await this.client.addChain({
          chainSpec: JSON.stringify(polkadot)
        });
        this.chain = await this.client.addChain({
          chainSpec: JSON.stringify(mainnet),
          potentialRelayChains: [polkadot_]
        });
      }
    })();

    this.options = options;
    this.batchQueue = [];

    if (this.options.batchInterval) {
      this.batchIntervalId = setInterval(() => {
        if (this.batchQueue.length > 0) {
          this.flush();
        }
      }, this.options.batchInterval);
    }
    this.getResponses();
  }

  public call(method: string, params: any[] = [], callback?: any): Promise<any> {
    const id = Math.floor(Math.random() * 1000000);
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: id,
      callback
    };

    return new Promise<any>((resolve, reject) => {
      this.batchQueue.push(request);
      if (
        this.options.maxBatchSize &&
        this.batchQueue.length >= this.options.maxBatchSize
      ) {
        this.flush().catch((error) => reject(error));
      }
    });
  }

  public async getResponses() {
    setInterval(async () => {

      this.chain!.nextJsonRpcResponse().then((response) => {
          console.log('response:: ', response);
          const parsed = JSON.parse(response);
          const request = this.sentRequests.find((request) => {
            return request.id === parsed.id;
          });

          if (request?.callback) {
            request.callback(response);
          }
        });
    }, 1000);

  }

  public async flush(): Promise<string[]> {
    if (this.batchQueue.length === 0) {
      return Promise.resolve([]);
    }

    const batchRequest: Promise<string>[] = [];
    for (let i = 0; i < this.batchQueue.length; i++) {
      const request = this.batchQueue[i];
      if (request) {
        try {
            console.log('sending:: ', JSON.stringify(request))
        this.chain!.sendJsonRpc(JSON.stringify(request));
        this.sentRequests.push(request);
        } catch (error) {
            console.log('error', error);
        }
      }
    }
    this.batchQueue = [];

    const promise = Promise.all(batchRequest)
    return promise;
  }

  public destroy(): void {
    if (this.batchIntervalId) {
      clearInterval(this.batchIntervalId);
    }
  }
}

const hex = '0x45028400c6f5bc3043731278e954cd2bf0456a0b7e5b28121af089fdc8353c8fe751255f01d49f8980adf580fd40735da3a1d0b19fed364a3e6265c4f2f9872b11f473ce4db163780448e6097a4e2be71bf0220748309cc635488d0ac2dc8af33c067cf286e5015109000203000e33071336d2a43c94668532a3929cdd3f8c6ac2ee1996325ca3ac9414583e2d0700e8764817'

async function run () {
  const client = new BatchJsonRpcClient({ testnet: false, maxBatchSize: 1, batchInterval: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 4000));

  client.call('system_health', [], (response: string) => {
    console.log('response:: ', response);
  });

  client.call('author_submitAndWatchExtrinsic', [hex], (response: string) => {
    console.log('response:: ', response);
  });
}

run()

