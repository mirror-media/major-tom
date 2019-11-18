const {getDeployVersion, uploadDist, patchDeployment} = require('./k8s.js');

module.exports = function(robot){
  
    robot.respond(/list readr deploy/i, async msg => {
        const pods = await client.apis.app.v1.namespaces('default').deployments.get()
        console.log(pods)
    })

    robot.respond(/version\s+mm\s+(plate-vue-mobile|plate-vue|tr-projects-rest)/i, async msg => {
        let deployName = msg.match[1];
        
        try {
        let version = await getDeployVersion("default", deployName)
        msg.send(`${deployName} is using ${version}`)
        } catch (err) {
        msg.send(err)
        }
    });

    robot.respond(/deploy\s+mm\s+(plate-vue-mobile|tr-projects-rest|plate-vue)\s+(.+)/i, async msg => {
        const deployName = msg.match[1]
        const repoName = (deployName === "tr-projects-rest") ? "mirrormedia-rest" : deployName
        const fullImage = `gcr.io/mirrormedia-1470651750304/${repoName}:${msg.match[2]}`
        const canaryName = `${deployName}-canary`

        if (deployName !== "tr-projects-rest"){
            msg.send("start uploading sequence")
            try {
                await uploadDist("dist", canaryName, fullImage, "dist")
                msg.send("dist uploaded.")
            }catch (err) {
                msg.send(err)
            }
        }

        try {
            await patchDeployment("default", deployName, {
              body: {
                spec: {
                  template: {
                    spec: {
                      containers: [{
                        name: deployName,
                        image: fullImage,
                      }]
                    }
                  }
                }
              }
            });
            msg.send(`${deployName} updated`)
        } catch (err) {
            msg.send(`Update deployment ${deployName} error: `, err)
        }
    })        

    robot.respond(/upload\s+dist\s+mm\s+(plate-vue-mobile|plate-vue)\s+(.+)/i, async msg => {
        const deployName = msg.match[1]
        const repoName = (deployName === "tr-projects-rest") ? "mirrormedia-rest" : deployName
        const fullImage = `gcr.io/mirrormedia-1470651750304/${repoName}:${msg.match[2]}`
        const canaryName = `${deployName}-canary`

        try {
            await uploadDist("dist", canaryName, fullImage, "dist")
            msg.send("dist uploaded.")
        }catch (err) {
            msg.send(err)
        }
    })
}

