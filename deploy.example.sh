rm deploy.zip 2> /dev/null

7z a -r -tzip deploy.zip *.js sendPermitMsgs/* common/* node_modules/*

aws lambda delete-function --function-name everbridge_link 2> /dev/null

aws lambda create-function --function-name everbridge_link \
--description "Pull two files from database and SFTP to Everbridge" \
--zip-file fileb://deploy.zip \
--role role-name \
--tags "tag=value" \
--timeout 30 \
--environment Variables="{ \
host=, \
database=, \
user=, \
password=, \

tableName1=, \
schemaName1=, \
fileName1=, \
sftpSite1=, \
sftpUser1=, \
sftpKeyFile1=, \

tableName2=, \
schemaName2=, \
fileName2=, \
sftpSite2=, \
sftpUser2=, \
sftpKeyFile2= \
}" \
--vpc-config SubnetIds=subnet-id,subnet-id2,SecurityGroupIds=sg-id \
--handler index.handler --runtime nodejs10.x