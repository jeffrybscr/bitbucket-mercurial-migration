Bitbucket is sunsetting of mercurial support. I had 30+ repositories of many years of code, and I had a last-minute notification, so I had to rush to move them to git.  Migrating the 30+ repositories, even with the help of hg-fast-export was a titanic journey, so I created this NodeJS app that connects to BitBucket API's extract the repositories, develop new ones, and migrate them all from a Container, so we don't have to mess up with our environment.

I hope this might help someone else.


node -e 'require("./index").migrate().'

Docker build -t gitmigration .

docker run -e BIT_BUCKET_USERNAME=YOUR_USERNAME -e BIT_BUCKET_SECRET=YOUR_PASSWORD -e BIT_BUCKET_USER=YOUR_USER -e BIT_BUCKET_EMAIL=YOUR_EMAIL gitmigration

