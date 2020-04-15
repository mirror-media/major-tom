require('dotenv').config();

//
const GCP_KEYFILE = process.env.GCP_KEYFILE;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;

const { exec } = require('child_process');

const addImageTag = async (partialDevTag, prodTag, callback) => {
    console.log("exec", `gcloud container images list-tags --filter="tags:*${partialDevTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/readr-restful`)
    exec(`gcloud container images list-tags --filter="tags:*${partialDevTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/readr-restful`, (err, stdout, stderr) => {
        if (err) {
            // node couldn't execute the command
            return callback(err);
        }
        if (stdout.split("\n").length < 2) {
            return callback("No such image");
        }
        // the *entire* stdout and stderr (buffered)
        devTag = stdout.split("\n")[1]
        console.log(`gcloud container images add-tag gcr.io/mirrormedia-1470651750304/readr-restful:${devTag} gcr.io/mirrormedia-1470651750304/readr-restful:${prodTag}`)
        exec(`gcloud -q container images add-tag gcr.io/mirrormedia-1470651750304/readr-restful:${devTag} gcr.io/mirrormedia-1470651750304/readr-restful:${prodTag}`, (err, stdout, stderr) => {
            if (err) {
                return callback(err)
            } else {
                return callback(null, devTag)
            }
        });
    });
}

module.exports = {
    addImageTag
};
