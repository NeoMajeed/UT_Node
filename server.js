const ethAirBalloons = require('ethairballoons');
const path = require('path');
const {create} = require('ipfs-http-client');
const savePath = path.resolve(__dirname + '/contracts');
const express = require('express')
const fs = require('fs');
const mysql = require("mysql2");
const bodyParser = require('body-parser')
const { jsPDF } = require("jspdf"); // will automatically load the node version
const { json } = require('express/lib/response');

const app = express()
const port = 3000

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json())

//const ipfs = ipfsClient.create({ host: 'localhost', port: '5001', protocol: 'http'});
const ethAirBalloonsProvider = ethAirBalloons('http://localhost:7545', savePath); 

async function ipfsClient() {
    const ipfs = await create(
        {
            host: "localhost",
            port: 5001,
            protocol: "http"
        }
    );
    return ipfs;
}

// ceate a connection to database
const db = mysql.createConnection({
    host:   'localhost',
    user:   'root',
    port:   '3306',
    password:   '',
    database:   'project_ut'
});

// connect to database 
db.connect( (error) =>{
    if(error) {
        console.log(error)
    } else {
        console.log("MYSQL Connected...")
    }
})

// create students schema 
const students = ethAirBalloonsProvider.createSchema({
    name: "Student",
    contractName: "studentsContract",
    properties: [
        {
            name: "id",
            type: "bytes32",
            primaryKey: true
        },
        {
            name: "ipfsHash",
            type: "string",
        },
    ]
});

students.deploy(function (err, success) {
    if (!err) {
        console.log("Contract deployed successfully!")
    } else {
        console.log("Contract deployment error" + err)
    }
}) 

async function getHash(input) {
    let ipfs = await ipfsClient();
    const data = JSON.stringify(input)
    const NID = input.NID;
    const {cid} = await ipfs.add({path: `${NID}.json`, content: data}, {cidVersion:1})
    const ipfsHash = cid.toString();
    console.log("Hash:",ipfsHash);
    console.log(typeof(cid));
    return ipfsHash;
}

async function getObject(data){
    let {NID} = data
    let ipfsHash = await getHash(data)
    console.log("outer:",ipfsHash)
    const dataContract = {
        id: NID,
        ipfsHash: ipfsHash
    }
    return dataContract;                
}



const all = (alldatahashes, res, who) =>{ 
    students.find( async(err, allObjects) => {
        if (!err) {
            const hashes = []
            //res.send(allObjects);
            console.log("allobjects",typeof(allObjects))
            console.log("All objects: ", allObjects);
            allObjects.forEach(function (object) {
                 hashes.push(object.ipfsHash);
             })
             console.log("hashes: ", hashes)
             alldatahashes(hashes, res , who);
             //res.render('recuit', {data: allstudent})     
        } else {
            res.send(err)
        }
    });    
}

async function getDataHashres (hash) {
    const node = await ipfsClient()
    
    const stream = node.cat(hash)
    let data = ''
    
    for await (const chunk of stream) {
      // chunks of data are returned as a Buffer, convert it back to a string
      data += chunk.toString()
    }
    //console.log("data: ",data)
    return data;
};

async function alldatahashes (hashes, res ,who) {
    let allstudent = []
    for(const hash of hashes){
        const data = await getDataHashres(hash);
        allstudent.push(JSON.parse(data));
    }
    console.log("done: ", allstudent)
    res.render(who, {data: allstudent});;
};

//PDF


app.post("/addStudent", (req, res) => {


    const body = req.body;
    console.log(body);
    
    const sql = `INSERT into students SET ?`;
    db.query(sql, body, function (err, data) {
        if (err) throw err;
            console.log("Student inserted to DATABASE successfully ")
    })


    getObject(body).then(data => {
        students.save(data, function (err, objectSaved) {
            if (!err) {
                console.log("object saved successfully");
            }
            else{
                alert("object save error")
            }
        }); 
    })
    let who = "addStudent"
    setTimeout(() => {
        all(alldatahashes, res, who)
    },500);
});

app.get('/', (req, res) =>{
    res.render('home');
});

app.get('/verifie', (req, res) =>{
    res.render('verifie', {data: '', err: ''});
});

app.get('/addstudent', (req, res) =>{
    res.render('addStudent', {data: ''});
});

app.get('/recuit',(req,res)=>{
    let who = "recuit"
    all(alldatahashes, res, who)
});

app.get('/findall', (req,res) => {
    students.find(function (err, allObjects) {
        if (!err) {
            console.log("All objects: " + allObjects);
            typeof(allObjects)
            res.json(allObjects);
        } else {
            res.send(err)
        }
    });
});




app.post('/find', (req,res) => {
    const body = req.body;
    const {id} = body;
    students.findById(id, function (err, found) {
        if (!err) {
            getDataHashres(found.ipfsHash).then(data => {
            res.render('verifie', {data: JSON.parse(data), err: false});
            })
        } else {
            res.render('verifie', {data: '' ,err: true})
        }
    });
});

app.post('/update', (req,res) => {
    const body = req.body;
    const sql = `UPDATE students SET ? WHERE NID=?;`;
    db.query(sql, [body, body.NID], function (err, data) {
        if (err) throw err;
            console.log("Student deleted from DATABASE successfully ")
    });

    getObject(body).then(data => {
        students.updateById(data.id, data, function (err, objectSaved) {
            if (!err) {
                all(alldatahashes, res, "addStudent")
            } else {
                res.send(err)
            }
        });
    });

});

app.get('/delete/:id', (req,res) => {
    const sql = `DELETE FROM students WHERE NID=?`;
    db.query(sql, req.params.id, function (err, data) {
        if (err) throw err;
            console.log("Student deleted from DATABASE successfully ")
    });

    students.deleteById(req.params.id, function (err, found) {
        if (!err) {
            res.json({message: "Object deleted successfully"});
        } else {
            res.send(err)
        }
    });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));