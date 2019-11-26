require('dotenv').config();

//
const GCP_KEYFILE = process.env.GCP_KEYFILE;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;

// const {GCP_KEYFILE,GCP_PROJECT_ID, } = require('./config')

const storage = require('@google-cloud/storage');
const fs = require('fs');

const initBucket = (bucket) => {
    const gcs = storage({
        projectId: GCP_PROJECT_ID,
        keyFilename: GCP_KEYFILE,
    });

    return gcs.bucket(bucket);
};

const makeFilePublic = (bucketFile) => {
    return new Promise((resolve, reject) => {
        bucketFile.makePublic()
            .then(() => {
                resolve(bucketFile);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

const uploadFileToBucket = (bucket, filePath, options) => {
    return new Promise((resolve, reject) => {
        const opts = options || {};
        const bucketFile = bucket.file(opts.destination);
        const metadata = {};

        if (opts.filetype) {
            metadata.contentType = opts.filetype;
        }

        if (opts.cacheControl) {
            metadata.cacheControl = opts.cacheControl;
        }

        bucket.upload(filePath, options)
            .then(() => {
                resolve(bucketFile);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

const readdirAsync = (dirName) => {
    return new Promise((resolve, reject) => {
        fs.readdir(dirName, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
};

module.exports = {
    initBucket,
    makeFilePublic,
    uploadFileToBucket,
    readdirAsync,
};
