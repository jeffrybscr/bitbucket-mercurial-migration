const axios = require('axios');
const { exec } = require("child_process");

const BIT_BUCKET_USERNAME = process.env.BIT_BUCKET_USERNAME;
const BIT_BUCKET_SECRET = process.env.BIT_BUCKET_SECRET;
const BIT_BUCKET_USER = process.env.BIT_BUCKET_USER;
const BIT_BUCKET_EMAIL = process.env.BIT_BUCKET_EMAIL;

const ENCODED_BIT_BUCKET_SECRET = encodeURI(BIT_BUCKET_SECRET);

async function getAPICall(url) {
  let promise = new Promise((resolve, reject) => {
    let config = {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: BIT_BUCKET_USERNAME,
        password: BIT_BUCKET_SECRET
    }
    }      
    axios.get(url,config)
    .then(res => {
        resolve(res.data)
    })
    .catch(err => {
      console.error("API CALL Failed.")
      reject();
    });
  });

  return promise;
}

async function postAPICall(url, body) {
  let promise = new Promise((resolve, reject) => {
    let config = {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: BIT_BUCKET_USERNAME,
        password: BIT_BUCKET_SECRET
      }
    } 
    
    axios({
      method: 'post',
      url: url,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: BIT_BUCKET_USERNAME,
        password: BIT_BUCKET_SECRET
      },
      data: body
    })
    .then(res => {
        resolve(res.data)
    })
    .catch(err => {
      console.error("API CALL Failed.")
      reject();
    });
  });

  return promise;
}

async function getRepositoriesInfo() {
  let results = [];
  let promise = new Promise(async (resolve, reject) => {
    let pageData = await getAPICall(`https://api.bitbucket.org/2.0/repositories/${BIT_BUCKET_USER}`);

    results = results.concat(pageData.values);

    while (pageData.next) {
      pageData = await getAPICall(pageData.next);
      if(pageData.values){
        results = results.concat(pageData.values);
      }
    }

    resolve(results);

  });


  return promise;
}


async function createNewGitRepository(repoInfo) {
  
  let repo = {
    "name": `${repoInfo.name}-git`,
    "forkable": repoInfo.fork_policy == "allow_forks",
    "has_wiki": repoInfo.has_wiki,
    "is_private": repoInfo.is_private,
    "project": {"key": "PROJ"}
  };


  let promise = new Promise(async (resolve, reject) => {
    postAPICall(`https://api.bitbucket.org/2.0/repositories/${BIT_BUCKET_USER}/${repoInfo.slug}-git`, repo).then( data => {
      resolve(data)
    }).catch(error => {
      console.log(`error: ${error.message}`);
      reject();
    }) ;
    
  });


  return promise;
}

async function execCommand(...cmds) {
  
  let cmd = cmds.join(" && ");


  let promise = new Promise(async (resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            reject();
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            reject();
        }
        console.log(`stdout: ${stdout}`);
        resolve();
    });
    
  });


  return promise;
}

async function cloneHgRepository(repoInfo) {
  
  let promise = new Promise(async (resolve, reject) => {
    await execCommand(`hg clone https://${BIT_BUCKET_USER}:${ENCODED_BIT_BUCKET_SECRET}@bitbucket.org/${repoInfo.repo}`);
    resolve();
  });


  return promise;
}

async function migrateToGit(repoInfo) {
  
  let promise = new Promise(async (resolve, reject) => {

    let targetRepo = `${repoInfo.slug}-git`;

    try {
      await execCommand(
        `git init ${targetRepo}`
      );
  
      await execCommand(
      `cd ${targetRepo}`, 
      `git config user.email "${BIT_BUCKET_EMAIL}"`,
      `git config user.name "${BIT_BUCKET_USER}"`
      );
  
      await execCommand(
        `cd ${targetRepo}`, 
        `sh /usr/src/app/fast-export/hg-fast-export.sh --quiet -r /usr/src/app/${repoInfo.slug} --force`
      ).catch((error) => {
        //we are going to ignore this errors
      });

      await execCommand(
        `cd ${targetRepo}`, 
        `git checkout HEAD`,
        `git remote add origin https://${BIT_BUCKET_USER}:${ENCODED_BIT_BUCKET_SECRET}@bitbucket.org/${BIT_BUCKET_USER}/${repoInfo.slug}-git.git`,
        `git push -u origin master`
      ).catch((error) => {
        //we are going to ignore this errors
      });
      resolve();
    } catch (e) {
      reject();
    } 
   
  });


  return promise;
}

function filterData(data){
  let migrated = {};
  let results = [];
  for (var q in data) {
      migrated[data[q].slug] = true;
  }

  for (var q in data) {
    if (data[q].scm == 'hg' && data[q].owner.nickname == BIT_BUCKET_USER){
      if (!migrated[`${data[q].slug}-git`]){
        results.push(data[q]);
      }
    }
  }

  return results;

}


exports.migrate = async () => {
  
  let data  = await getRepositoriesInfo();

  //filter mercurial and my repositories
  let filteredData  = filterData(data);

  for (var q in filteredData) {
    let repo = filteredData[q];
    let newRepo = {
      slug: repo.slug, 
      scm: repo.scm, 
      uuid: repo.uuid, 
      name: repo.name,
      repo: repo.full_name,
      fork_policy: repo.fork_policy,
      has_wiki: repo.has_wiki,
      is_private: repo.is_private
    };

    console.log(`Processing ${repo.name}`);

    await cloneHgRepository(newRepo);
    await createNewGitRepository(newRepo);
    await migrateToGit(newRepo);

  }
  
  console.log(`Finalized Repositories: ${filteredData.length}`);

    
};