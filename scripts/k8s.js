const kubernetesClient = require("kubernetes-client");

const Client = kubernetesClient.Client;
const config = kubernetesClient.config;

const path = require("path");
const fs = require("fs");
const util = require("util");

const readFileAsync = util.promisify(fs.readFile);

const client = new Client({
  config: process.env.NODE_ENV === "production" ? config.getInCluster() : config.fromKubeconfig(),
  version: "1.9"  //there is a list in docs of the options you have
});

// List deploy in namespace
const listDeploy = async (ns, deployName) => {
  
  let version
  
  try {
    const deploy = await client.apis.apps.v1.namespaces(ns).deployments(deployName).get();
    console.log(deploy.statusCode)
    switch (deploy.statusCode)  {
      case 200:
        let containers = deploy.body.spec.template.spec.containers;
        for (let i=0; i < containers.length ; i++) {
          if (containers[i].name === deployName) {
            version = containers[i].image.slice(containers[i].image.indexOf(":")+1);
            break;
          } 
        }
        break;
      default:
        return "not found"
    }
    return version 

  } catch (err) {
    console.log(err)
  }
}

// RegExp-replace all substring occurence in a string
const replaceAll = (str, find, replace) => {
  return str.replace(new RegExp(find, 'g'), replace);
}

// Open canary-template.json, and use it to create a deployment "deployName" with image "Imagever"
const createDeploy = async (ns, deployName, imageVer) => {
  // Prepare manifest
  let deployManifest
  
  try {
    let template = await readFileAsync(path.resolve(__dirname, "../manifests/canary-template.json"), "utf8")
    deployManifest = JSON.parse(replaceAll(template, "canaryName", deployName))
    deployManifest.spec.template.spec.containers[0].image = imageVer
  }catch (err) {
    console.log(err)
    return err
  }
  // create deployment
  try{
    const create = await client.apis.apps.v1.namespaces(ns).deployments.post({body: deployManifest})
    console.log(create.statusCode) // 201 if success
  }catch (err){
    console.log(err)
    return err
  }
  return "create succeeded"
}

const uploadDist = async (ns, deployName) => {

}

// Upgrade image of deployments
const patchDeployImage = async (ns, deployName, imageVer) => {
  
  try {

    const updateImage = await client.apis.apps.v1.namespaces(ns).deployments(deployName).patch({
      body: {
        spec: {
          template: {
            spec: {
              containers: [{
                name: deployName,
                image: imageVer
              }]
            }
          }
        }
      }
    })
    console.log(updateImage.statusCode)
  } catch(err) {
    console.log(err)
    return err
  }
}

// Scale deployment in specified namespace
const scaleDeploy = async (ns, deployName, rep) => {
  
  try {
    const scaleDeploy = await client.apis.apps.v1.namespaces(ns).deployments(deployName).patch({
      body: {
        spec: {
          replicas: rep
        }
      }
    })
    return scaleDeploy.statusCode
  } catch (err) {
    console.log(err)
    return err
  }
}

function osCmd(command, arguments) {
    const
      { spawnSync } = require( 'child_process'),
      cmd = spawnSync(command, arguments)
      console.log( `kubectl result: stdout: ${cmd.stdout.toString()}` ) 
      console.log( `kubectl result: stderr: ${cmd.stderr.toString()}` )   
}

// module.exports = {
//     client,
//     osCmd
// }