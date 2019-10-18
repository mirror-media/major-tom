require('dotenv').config()

const GCS_FILE_BUCKET = process.env.GCS_FILE_BUCKET
const GCS_BUCKET_PATH = process.env.GCS_BUCKET_PATH

const {initBucket, uploadFileToBucket, readdirAsync, makeFilePublic, } = require('./gcs.js');

const {client, osCmd, } = require('./k8s.js');

module.exports = function(robot){
  
  robot.respond(/who are you/i, msg => {
    msg.send("I am Tom")
  })

  robot.respond(/version\s+tt\s+(readr-site-mobile|readr-site|news-projects|readr-restful)/i, async msg => {
    try {
      let deployName = msg.match[1];
      const deploy = await client.apis.apps.v1.namespaces('default').deployments(deployName).get();
      
      if (deploy.statusCode === 200) {
        let containers = deploy.body.spec.template.spec.containers;
        for (let i=0; i < containers.length ; i++) {
          if (containers[i].name === deployName) {
            var version = containers[i].image.slice(containers[i].image.indexOf(":")+1);
            break;
          } 
        }
        msg.send(`${deployName} is using ${version}`)
      } else {
        console.log(deploy.statusCode)
      }
    } catch (err) {
        msg.send(err)
    }
  });

  robot.respond(/deploy\s+rr\s+(readr-site-mobile|readr-site|news-projects|readr-restful)\s+(.+)/i, async msg => {
    
    const deployName = msg.match[1];
    const version = "gcr.io/mirrormedia-1470651750304/" + deployName + ":" + msg.match[2];
    const canaryName = deployName + "-canary"

    switch (deployName) {
      case "readr-site-mobile":
        var distribution = "distribution"
        break;
      case "readr-site":
        var distribution = "distribution"
        break;
      case "news-projects":
        var distribution = "dist"
        break;
    }

    if (deployName !== "readr-restful"){
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
        var distFolder = `/tmp/${podName}/${distribution}`
        osCmd('kubectl', ['cp', `${podName}:/usr/src/${distribution}`, distFolder, '-n', 'dist'])
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
          };
    try {
      deploy = await client.apis.apps.v1.namespaces('default').deployments(deployName).patch({body: newImage});
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

  robot.respond(/upload\s+dist\s+rr\s+(readr-site-mobile|readr-site|news-projects|readr-restful)\s+(.+)/i, async msg => {
    
    const deployName = msg.match[1];
    const version = "gcr.io/mirrormedia-1470651750304/" + deployName + ":" + msg.match[2];
    const canaryName = deployName + "-canary"

    switch (deployName) {
      case "readr-site-mobile":
        var distribution = "distribution"
        break;
      case "readr-site":
        var distribution = "distribution"
        break;
      case "news-projects":
        var distribution = "dist"
        break;
    }

    if (deployName !== "readr-restful"){
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
        var distFolder = `/tmp/${podName}/${distribution}`
        osCmd('kubectl', ['cp', `${podName}:/usr/src/${distribution}`, distFolder, '-n', 'dist'])
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
  })
}

            