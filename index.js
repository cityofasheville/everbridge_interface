const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
let FTPClient = require('ssh2-sftp-client');
var fs = require('fs');

const FilesToSend = [
    {
        tableName: process.env.tableName1,
        schemaName: process.env.schemaName1,
        fileName: process.env.fileName1,
        sftpSite: process.env.sftpSite1,
        sftpUser: process.env.sftpUser1,
        sftpKeyFile: process.env.sftpKeyFile1
    },
    {
        tableName: process.env.tableName2,
        schemaName: process.env.schemaName2,
        fileName: process.env.fileName2,
        sftpSite: process.env.sftpSite2,
        sftpUser: process.env.sftpUser2,
        sftpKeyFile: process.env.sftpKeyFile2
    }, 
]

const dbConfig = {
    authentication: {
        type: "default",
        options: {
            userName: process.env.user, 
            password: process.env.password, 
        }
    },
    server: process.env.host,
    options: {
        database: process.env.database,  
        encrypt: false
    }
}

async function Run(){
    try {
        for (FileToSend of FilesToSend) {
            await loadAFile(FileToSend);
        };
    } catch(err) {
        console.error(err);
    }
}
exports.handler = (event, context, callback) => {
    Run();
}

///////////////////////////////////////////////////////////////////////////////////////////////////////
function loadAFile(FileToSend){
    return new Promise(function(resolve, reject) {
        const { tableName, schemaName, sftpSite, sftpUser, sftpKeyFile } = FileToSend;
        let colNames = '';

        console.log('Getting Column Names ' + tableName);

        const connection = new Connection(dbConfig);
        connection.on('connect', function(err) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                console.log('Connected');
                const request = new Request(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND TABLE_SCHEMA = '${schemaName}';`,
                    function(err, rowCount, rows) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log(rowCount + ' Column Names returned');
                    }
                    colNames = colNames.slice(0,-1) + '\n';
                });
                request.on('row', function(columns) {
                    columns.forEach(function(column) {
                        colNames  += quoteCell(column.value);
                    });
                });
                request.on('requestCompleted', function (rowCount, more, rows) { 
                    resolve(GetRows(FileToSend,colNames,connection));
                });
                connection.execSql(request);
            }
        });
    });
}

function GetRows(FileToSend,colNames,connection) {
    return new Promise(function(resolve, reject) {
        const { tableName, schemaName, fileName } = FileToSend;
        const sqlStr = `select * from ${schemaName}.${tableName};`;

        console.log(sqlStr);

        const request = new Request(
            sqlStr,
            function(err, rowCount, rows) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                console.log(rowCount + ' rows returned ' + fileName);
            }
            connection.close();
        });

        //create out file
        let outFile = fs.createWriteStream(fileName);
        outFile.write(colNames);

        request.on('row', function(columns) {
            let aRow = '';
            columns.forEach(function(column) {
                aRow += quoteCell(column.value);
            });
            outFile.write(aRow.slice(0,-1) + '\n');
        });
        request.on('requestCompleted', function (rowCount, more, rows) { 
            outFile.end();
            resolve(FtpStep(FileToSend));
        });
        connection.execSql(request);
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////////
function quoteCell(inStr){
    if (inStr === null||inStr.trim()==='') {
        return ',';
    }
    inStr = inStr.replace(/\n/g, '');
    if (inStr.indexOf(',')!==-1||inStr.indexOf('"')!==-1) {
        return '"' + inStr.toString().trim().replace(/\"/g, '""') + '",';
    } else {
        return       inStr.toString().trim().replace(/\"/g, '""') + ',';
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////
function FtpStep(FileToSend){
    return new Promise(function(resolve, reject) {

        console.log("Sending to FTP."); 
        const { sftpSite, sftpUser, sftpKeyFile, fileName } = FileToSend;

        let readStream = fs.createReadStream(fileName);
        let sftp = new FTPClient();
        sftp.on('close', (sftpError) => {
        if(sftpError){
            console.error(new Error("sftpError"));
        }
        });
        sftp.on('error', (err) => {
        console.log("err2",err.level, err.description?err.description:'');
        console.error(new Error(err));
        });

        sftp.connect({
            host: sftpSite,
            username: sftpUser,
            privateKey: fs.readFileSync("./"+sftpKeyFile)
        }).then(() => {
        return sftp.put(readStream, "./replace/"+fileName);
        }).then(res => {
            console.dir("Sent to SFTP", res);
            sftp.end();
            resolve(0);
        }).catch(err => {
        console.log("err3");
        console.error(err);
        sftp.end();
        });
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////////
process.on('uncaughtException', (err)=>{
    console.log(err);
});

