require('dotenv').config();

const GCP_KEYFILE = process.env.GCP_KEYFILE;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;

const { exec } = require('child_process');

const addImageTag = async (deployName, partialDevTag, prodTag, callback) => {
    /* The new prodTag should be greater than any existing prodTag in desc lexicographic order.
    Besides, one image can only have one prodTag, or the filter won't work properly due to its limited functionality. */
    console.log("exec", `gcloud container images list-tags --filter="tags~^\\d.*$ AND NOT tags<${prodTag}" --format="csv(tags)" gcr.io/${GCP_PROJECT_ID}/${deployName}`)
    exec(`gcloud container images list-tags --filter="tags~^\\d.*$ AND NOT tags<${prodTag}" --format="csv(tags)" gcr.io/${GCP_PROJECT_ID}/${deployName}`, (err, stdout, stderr) => {
        if (err) return callback(err);
        if (stdout.split("\n").length > 1) return callback("Version can only be increased");

        console.log("exec", `gcloud container images list-tags --filter="tags:*${partialDevTag}" --format="csv(tags)" gcr.io/${GCP_PROJECT_ID}/${deployName}`);
        exec(`gcloud container images list-tags --filter="tags:*${partialDevTag}" --format="csv(tags)" gcr.io/${GCP_PROJECT_ID}/${deployName}`, (err, stdout, stderr) => {
            if (err) return callback(err);
            if (stdout.split("\n").length < 2) return callback("No such image");

            // Get devTag from buffered `stdout`
            devTag = stdout.split("\n")[1];

            console.log(`gcloud container images add-tag gcr.io/${GCP_PROJECT_ID}/${deployName}:${devTag} gcr.io/${GCP_PROJECT_ID}/${deployName}:${prodTag}`)
            exec(`gcloud -q container images add-tag gcr.io/${GCP_PROJECT_ID}/${deployName}:${devTag} gcr.io/${GCP_PROJECT_ID}/${deployName}:${prodTag}`, (err, stdout, stderr) => {
                if (err) return callback("An image can only have one prod tag. Please use `revisions` and `rollback` commands to fallback");

                return callback(null, devTag);
            });
        });
    });
}

const getGCRVersion = async (deployName, deployTag, callback) => {
    console.log("exec", `gcloud container images list-tags --filter="tags=${deployTag}" --format="csv(tags)" gcr.io/${GCP_PROJECT_ID}/${deployName}`);
    exec(`gcloud container images list-tags --filter="tags=${deployTag}" --format="csv(tags)" gcr.io/${GCP_PROJECT_ID}/${deployName}`, (err, stdout, stderr) => {
        if (err) return callback(err);

        const rets = stdout.split("\n");
        if (rets.length > 1) {
            const gcrTags = rets[1].replace(/"/g, '').split(',').sort().reverse();
            const version = gcrTags.join(', ');
            return callback(null, `[${version}]`);
        }

        return callback(null, `[${deployTag}]`);
    });
}

module.exports = {
    addImageTag,
    getGCRVersion
};
