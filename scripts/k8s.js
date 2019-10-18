require('dotenv').config();

const kubernetesClient = require('kubernetes-client');

const Client = kubernetesClient.Client;
const config = kubernetesClient.config;

// const inCluster = process.env.NODE_ENV === "production";//you can determine this your way

const client = new Client({
  config: process.env.NODE_ENV === "production" ? config.getInCluster() : config.fromKubeconfig(),
  version: "1.9"//there is a list in docs of the options you have
});

function osCmd(command, arguments) {
    const
      { spawnSync } = require( 'child_process'),
      cmd = spawnSync(command, arguments)
      console.log( `kubectl result: stdout: ${cmd.stdout.toString()}` ) 
      console.log( `kubectl result: stderr: ${cmd.stderr.toString()}` )   
}

module.exports = {
    client,
    osCmd
}