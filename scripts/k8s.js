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

exec = require('child_process').exec;

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
        throw `error status: ${err.statusCode}`;
    }
};

// RegExp-replace all substring occurence in a string
const replaceAll = (str, find, replace) => {
    return str.replace(new RegExp(find, 'g'), replace);
};

// Open canary-template.json, and use it to create a "deployment" in "namespace" with new "version"
const createCanary = async (namespace, deployment, version) => {
    // Prepare manifest
    let deployManifest;

    try {
        const template = await readfileAsync(path.resolve(__dirname, '../manifests/canary-template.json'), 'utf8');
        deployManifest = JSON.parse(replaceAll(template, 'canaryName', deployment));
        deployManifest.spec.template.spec.containers[0].image = version;
    } catch (err) {
        console.log(err);
        return err;
    }
    // create deployment
    try {
        const create = await client.apis.apps.v1.namespaces(namespace).deployments.post({body: deployManifest});
        console.log(create.statusCode); // 201 if success
    } catch (err) {
        console.log(err);
        return err;
    }
    return 'create succeeded';
};

const uploadDist = async (namespace, deployment, version, distribution) => {
    try {
        const deploy = await client.apis.apps.v1.namespaces(namespace).deployments(deployment).get();
        console.log(`deploy status: ${deploy.statusCode}`);
        switch (deploy.statusCode) {
        case 200:
        // Scale canary to 1
            try {
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
                console.log('scale news-project-canary to 1');
            } catch (err) {
                throw err;
            }
            break;

        default:
            throw 'error finding or creating canary';
        }
    } catch (err) {
        console.log('finding news-projects-canary error');
        try {
            const deploy = await createCanary('dist', 'news-projects-canary', version);
            console.log(deploy);
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
    // Create delay for pods to be ready. There is a gap between status ready to actual ready
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(3000);

    // Get pod's name and copy dist
    let canaryPod;
    try {
        const pod = await client.api.v1.namespaces(namespace).pods.get({qs: {labelSelector: `app=${deployment}`}});
        canaryPod = pod.body.items[0].metadata.name;
        console.log(`Found canary pod name: ${canaryPod}`);
    } catch (err) {
        throw err;
    }


    // Copy dist file out
    const distFolder = `./dist/${canaryPod}`;
    try {
        const {stdout, stderr} = await sh(`kubectl -n dist cp ${canaryPod}:/usr/src/${distribution} ${distFolder}`);
        console.log(`kubectl cp: ${stdout}`);
        console.log(`kubectl cp: ${stderr}`);
    } catch (err) {
        throw err;
    }

    // Upload dist
    const bucket = initBucket(GCS_FILE_BUCKET);
    const destination = GCS_BUCKET_PATH;
    try {
        files = await readdirAsync(distFolder);
    } catch (err) {
        throw err;
    }

    await Promise.all(files.map( (filename) => {
        return uploadFileToBucket(bucket, `${distFolder}/${filename}`, {
            destination: `${destination}/${filename}`,
        }).then((bucketFile) => {
            console.log(`file ${filename} upload to gcs successfully.`);
            makeFilePublic(bucketFile);
        }).catch((err) => {
            console.log(`Error code: ${err.code}`);
        });
    }))
        .then(async () => {
            await sh(`rm -rf ${distFolder}`);
            console.log('finished removing dist temp files');
        }).catch( (err) => {
            console.log(err);
        });

    try {
        await patchDeployment(namespace, deployment, {
            body: {
                spec: {
                    replicas: 0,
                },
            },
        });
        console.log(`scale ${deployment}:${namespace} to 0`);
    } catch (err) {
        throw err;
    }
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
async function sh(cmd) {
    return new Promise( (resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(err);
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
