require('dotenv').config();

const GCS_FILE_BUCKET = process.env.GCS_FILE_BUCKET;
const GCS_BUCKET_PATH = process.env.GCS_BUCKET_PATH;
const {initBucket, uploadFileToBucket, readdirAsync, makeFilePublic} = require('./gcs.js');

const kubernetesClient = require('kubernetes-client');

const Client = kubernetesClient.Client;
const config = kubernetesClient.config;

const path = require('path');
const fs = require('fs');
const util = require('util');

const readfileAsync = util.promisify(fs.readFile);

const exec = require('child_process').exec;

const client = new Client({
    config: process.env.NODE_ENV === 'production' ? config.getInCluster() : config.fromKubeconfig(),
    version: '1.9', // there is a list in docs of the options you have
});

// List deploy in namespace
const getDeployVersion = async (ns, deployName) => {
    let version;

    try {
        const deploy = await client.apis.apps.v1.namespaces(ns).deployments(deployName).get();
        console.log(`Get image version success. Status: ${deploy.statusCode}`);
        switch (deploy.statusCode) {
        case 200:
            const containers = deploy.body.spec.template.spec.containers;
            for (let i=0; i < containers.length; i++) {
                if (containers[i].name === deployName) {
                    version = containers[i].image.slice(containers[i].image.indexOf(':')+1);
                    break;
                }
            }
            break;
        default:
            throw 'not found';
        }
        return version;
    } catch (err) {
        console.error(`get deploy version failed.`, err);
        throw `error status: ${err.statusCode}`;
    }
};

// RegExp-replace all substring occurence in a string
const replaceAll = (str, find, replace) => {
    return str.replace(new RegExp(find, 'g'), replace);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Open canary-template.json, and use it to create a "deployment" in "namespace" with new "version"
const createCanary = async (namespace, deployment, version) => {
    // Prepare manifest
    let deployManifest;

    try {
        const template = await readfileAsync(path.resolve(__dirname, '../manifests/canary-template.json'), 'utf8');
        deployManifest = JSON.parse(replaceAll(template, 'canaryName', deployment));
        deployManifest.spec.template.spec.containers[0].image = version;

        const create = await client.apis.apps.v1.namespaces(namespace).deployments.post({body: deployManifest});
        console.log(`createCanary success. statusCode: ${create.statusCode}`);
    } catch (error) {
        console.error(`createCanary failed`, error);
        throw new Error(error);
    }
};

const getReadyPod = async (namespace, deployment) => {
    let canaryPod, error;
    let retry = 0
    const MAXIMUM_RETRY = 3
    const RETRY_TIMEOUT = 3000
    do {
        retry += 1
        // Create delay for pods to be ready. There is a gap between status ready to actual ready
        await sleep(RETRY_TIMEOUT);
        // Get pod's name
        try {
            const pods = await client.api.v1.namespaces(namespace).pods.get({qs: {labelSelector: `app=${deployment}`}});
            for (pod_index in pods.body.items) {
                const continers = pods.body.items[pod_index].status.containerStatuses;
                for (container_index in continers) {
                    const container = continers[container_index];
                    if (container.name === deployment && container.ready) {
                        canaryPod = pods.body.items[pod_index].metadata.name;
                    }
                }
            }
        } catch (err) {
            error = err
            console.error(`get pod's name failed`, err, `retry count: `, retry);
        }
    } while (retry < MAXIMUM_RETRY && canaryPod === undefined);

    if (error) {
        throw err
    } else {
        console.log(`Found canary pod name: ${canaryPod}`);
        return canaryPod
    }
}

const uploadDist = async (namespace, deployment, version, distribution) => {
    console.log(`creating canary ${deployment}:${version} in ${namespace} to copy ${distribution}`);
    try {
        const deploy = await client.apis.apps.v1.namespaces(namespace).deployments(deployment).get();
        console.log(`deploy status: ${deploy.statusCode}`);
        switch (deploy.statusCode) {
        case 200:
            // Scale canary to 1
            await patchDeployment(namespace, deployment, {
                body: {
                    spec: {
                        replicas: 1,
                        template: {
                            spec: {
                                containers: [{
                                    name: deployment,
                                    image: version,
                                }],
                            },
                        },
                    },
                },
            });
            console.log(`scale ${deployment} to 1`);
            break;

        default:
            throw new Error('error finding or creating canary');
        }
    } catch (err) {
        console.error(`finding ${deployment} error.`, err);
        try {
            await createCanary(namespace, deployment, version);
        } catch (err) {
            throw err;
        }
    }

    // Get pod's name
    const canaryPod = getReadyPod(namespace, deployment);

    // Copy dist file out
    const distFolder = `./dist/${canaryPod}`;
    try {
        const {stdout, stderr} = await sh(`kubectl -n dist cp ${canaryPod}:/usr/src/${distribution} ${distFolder}`);
        console.log(`kubectl cp stdout:`, stdout);
        console.log(`kubectl cp stderr:`, stderr);
    } catch (err) {
        console.error(`copy dist file out failed`, err);
        throw err;
    }

    // Upload dist
    let files;
    const bucket = initBucket(GCS_FILE_BUCKET);
    const destination = GCS_BUCKET_PATH;
    try {
        files = await readdirAsync(distFolder);
    } catch (err) {
        console.error(`upload dist failed`, err);
        throw err;
    }

    Promise.all(files.map((filename) => {
        return uploadFileToBucket(bucket, `${distFolder}/${filename}`, {
            destination: `${destination}/${filename}`,
        }).then((bucketFile) => {
            console.log(`file ${filename} upload to gcs successfully.`);
            makeFilePublic(bucketFile);
        }).catch((err) => {
            console.log(`uploadFileToBucket error. error code: ${err.code}`);
        });
    }))
        .then(() => {
            sh(`rm -rf ${distFolder}`);
            console.log('finished removing dist temp files');
        })
        .then(() => {
            patchDeployment(namespace, deployment, {
                body: {
                    spec: {
                        replicas: 0,
                    },
                },
            });
            console.log(`scale ${deployment}:${namespace} to 0`);
        })
        .catch((err) => {
            console.error(`removing dist temp files or patch deployment failed`, err);
        });
};

// Patch a deployment with patchData, and watch it finishing the rollout
const patchDeployment = async (namespace, name, patchData) => {
    try {
        const updateImage = await client.apis.apps.v1.namespaces(namespace).deployments(name).patch(patchData);
        console.log(updateImage.statusCode);
    } catch (err) {
        console.log(err);
        return err;
    }

    // Watch the rolling-out
    const checkInterval = 2000;
    const checkTimeout = 30000;

    // Set Timeout for watch
    const timeout = setTimeout(async () => {
        clearInterval(interval);
        throw `Timeout: ${checkTimeout}`;
    }, checkTimeout);

    // Check deployment for every checkInterval
    const interval = setInterval(async () => {
        const deployment = await client.apis.apps.v1.namespaces(namespace).deployments(name).get();
        // There is no unavailableReplicas means all pods are available
        if (deployment.body.status.unavailableReplicas === undefined) {
            clearTimeout(timeout);
            clearInterval(interval);
            // console.log("rollout successful")
            return 'rollout successful';
        }
    }, checkInterval);
};

// shell command

function sh(cmd) {
    const MAXIMUM_RETRY = 3;
    const TIMEOUT = 3000;
    retry_count = 1;

    return new Promise((resolve, reject) => {
        exec(cmd, {timeout: TIMEOUT}, (err, stdout, stderr) => {
            if (err) {
                if (retry_count < MAXIMUM_RETRY) {
                    retry_count += 1;
                    resolve(sh(cmd, retry_count));
                } else {
                    reject(err);
                }
            } else {
                resolve({stdout, stderr});
            }
        });
    });
}

module.exports = {
    client,
    getDeployVersion,
    uploadDist,
    patchDeployment,
};
