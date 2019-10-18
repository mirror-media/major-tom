require('dotenv').config()

const GCS_FILE_BUCKET = process.env.GCS_FILE_BUCKET
const GCS_BUCKET_PATH = process.env.GCS_BUCKET_PATH

const {initBucket, uploadFileToBucket, readdirAsync, makeFilePublic, } = require('./gcs.js');

const {client, osCmd, } = require('./k8s.js');

module.exports = function(robot){
  
  robot.respond(/list readr deploy/i, async msg => {
    const pods = await client.apis.app.v1.namespaces('default').deployments.get()
    console.log(pods)
  })
  
  robot.respond(/version\s+mm\s+(plate-vue-mobile|plate-vue|tr-projects-rest|news-projects)/i, async msg => {
    try {
      let deployName = msg.match[1]
      const deploy = await client.apis.apps.v1.namespaces('default').deployments(deployName).get()
      
      if (deploy.statusCode === 200) {
        let containers = deploy.body.spec.template.spec.containers
        for (let i=0 ;i < containers.length ;i++) {
          if (containers[i].name === deployName) {
            var version = containers[i].image.slice(containers[i].image.indexOf(":")+1)
            break
          } 
        }
        msg.send(`${deployName} is using ${version}`)
      }
    } catch (err) {
        msg.send(err)
    }
  })
  
  robot.respond(/deploy\s+mm\s+(plate-vue-mobile|tr-projects-rest|news-projects|plate-vue)\s+(.+)/i, async msg => {
    const deployName = msg.match[1]
    const repoName = (deployName === "tr-projects-rest") ? "mirrormedia-rest" : deployName
    const version = "gcr.io/mirrormedia-1470651750304/"+repoName+":"+msg.match[2]
    const canaryName = deployName + "-canary"

    if (deployName !== "tr-projects-rest"){
      let canaryTemplate = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: canaryName,
          namespace: "dist",
          labels: {
            app: canaryName
          }
        },
        spec: {
          replicas: 1,
          selector: {
              matchLabels: {
              app: canaryName
              }
          },
          template: {
            metadata:{
              labels: {
                app: canaryName
              }
            },
            spec: {
              containers: [
                {
                  image: version,
                  name: canaryName
                }
              ]
            }
          }
        }
      }
      console.log(canaryTemplate)
  
      try {
        const create = await client.apis.apps.v1.namespaces('dist').deployments.post({ body: canaryTemplate })
      } catch (err) {
        msg.send(err)
      }
    
      // Watch the creation until it's done
      osCmd('kubectl', ['rollout', 'status', `deployment/${canaryName}`, '-w', '-n', 'dist'])
    
      try {
        const pod = await client.api.v1.namespaces('dist').pods.get({ qs: {labelSelector: `app=${canaryName}` }})
        var podName = pod.body.items[0].metadata.name
        console.log(`pod is named: ${podName}`)
        // Copy dist file out
        var distFolder = `/tmp/${podName}/dist`
        osCmd('kubectl', ['cp', `${podName}:/usr/src/dist`, distFolder, '-n', 'dist'])
      } catch (err) {
        msg.send(err)
      }
    
      const bucket = initBucket(GCS_FILE_BUCKET)
      const destination = GCS_BUCKET_PATH
      try {
        files = await readdirAsync(distFolder)
      } catch (err) {
        msg.send(err)
      }
  
      let result = await Promise.all(files.map( filename => {
        return uploadFileToBucket(bucket, `${distFolder}/${filename}`, {
          destination: `${destination}/${filename}`,
        }).then((bucketFile) => {
          console.log(`file ${filename} upload to gcs successfully.`)
          makeFilePublic(bucketFile)
        })
      }))
      .then(() => {
        // Remove temporary folder
        osCmd('rm', ['-rf', `/tmp/${podName}`])
      })
  
      
      // For now, Delete temporary pod here
      // Don't know how to delete after Promise.all above
      try {
        const deletePod = await client.apis.apps.v1.namespaces('dist').deployments(canaryName).delete()
      } catch (err) {
        msg.send(err) 
      }
    } // --- End of upload dist

    const newImage = {
      "spec": {
        "template": {
          "spec": {
            "containers": [{
              "name": deployName,
              "image": version,
            }]
          }
        }
      }
    }
    try {
      deploy = await client.apis.apps.v1.namespaces('default').deployments(deployName).patch({body: newImage})
      
      if (deploy.statusCode === 200) {
        osCmd('kubectl', ['rollout', 'status', `deployment/${deployName}`, '-w'])
        msg.send(`${deployName} updated`)
      } else {
        msg.send(`${deployName} update got status code: ${deploy.statusCode}`)
      }

    } catch (err) {
      msg.send(`Update deployment ${deployName} error: `, err)
    }
  })

  robot.respond(/upload\s+dist\s+mm\s+(plate-vue-mobile|news-projects|plate-vue)\s+(.+)/i, async msg => {
    const deployName = msg.match[1]
    const repoName = (deployName === "tr-projects-rest") ? "mirrormedia-rest" : deployName
    const version = "gcr.io/mirrormedia-1470651750304/"+repoName+":"+msg.match[2]
    const canaryName = deployName + "-canary"

    let canaryTemplate = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: canaryName,
        namespace: "dist",
        labels: {
          app: canaryName
        }
      },
      spec: {
        replicas: 1,
        selector: {
            matchLabels: {
            app: canaryName
            }
        },
        template: {
          metadata:{
            labels: {
              app: canaryName
            }
          },
          spec: {
            containers: [
              {
                image: version,
                name: canaryName
              }
            ]
          }
        }
      }
    }
    console.log(canaryTemplate)

    try {
      const create = await client.apis.apps.v1.namespaces('dist').deployments.post({ body: canaryTemplate })
    } catch (err) {
      msg.send(err)
    }
  
    // Watch the creation until it's done
    osCmd('kubectl', ['rollout', 'status', `deployment/${canaryName}`, '-w', '-n', 'dist'])
  
    try {
      const pod = await client.api.v1.namespaces('dist').pods.get({ qs: {labelSelector: `app=${canaryName}` }})
      var podName = pod.body.items[0].metadata.name
      console.log(`pod is named: ${podName}`)
      // Copy dist file out
      var distFolder = `/tmp/${podName}/dist`
      osCmd('kubectl', ['cp', `${podName}:/usr/src/dist`, distFolder, '-n', 'dist'])
    } catch (err) {
      msg.send(err)
    }
  
    const bucket = initBucket(GCS_FILE_BUCKET)
    const destination = GCS_BUCKET_PATH
    try {
      files = await readdirAsync(distFolder)
    } catch (err) {
      msg.send(err)
    }

    let result = await Promise.all(files.map( filename => {
      return uploadFileToBucket(bucket, `${distFolder}/${filename}`, {
        destination: `${destination}/${filename}`,
      }).then((bucketFile) => {
        console.log(`file ${filename} upload to gcs successfully.`)
        makeFilePublic(bucketFile)
      })
    }))
    .then(() => {
      // Remove temporary folder
      osCmd('rm', ['-rf', `/tmp/${podName}`])
    })

    
    // Delete temporary pod
    try {
      const deletePod = await client.apis.apps.v1.namespaces('dist').deployments(canaryName).delete()
      } catch (err) {
      msg.send(err)
    }
  })
}

