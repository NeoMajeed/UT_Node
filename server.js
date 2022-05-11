const ethAirBalloons = require('ethairballoons');
const path = require('path');
const {create} = require('ipfs-http-client');
const savePath = path.resolve(__dirname + '/contracts');
const express = require('express');
const fs = require('fs');
const mysql = require("mysql2");
const bodyParser = require('body-parser');
const { jsPDF } = require("jspdf");
const { json } = require('express/lib/response');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express()
const port = 3000

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json())

app.use(session({
    secret: 'ABCDefg',
    resave: false,
    saveUninitialized: true
}))

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
    let {NID, year, semester} = data;
    let ipfsHash = await getHash(data)
    let object = {
        NIDC: NID,
        year: year,
        semester: semester,
        hash: ipfsHash
    }
    const sql = `INSERT INTO certificates SET ?`;
    db.query(sql, object, (err, results) => {
        if(err) throw err;
    })
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
app.get('/pdf/:id', (req, res) => {
    students.findById((req.params.id), (err, result) => {
        let hash = '' 
        hash = result.ipfsHash;
        getDataHashres(hash).then(data => {

            const doc = new jsPDF();
            data = JSON.parse(data);
            let nameEN = `Name Of student: ${data.nameEN}`;
            let NID = `National Nubmer: ${data.NID}`;
            let major = `Major: ${data.major}`;
            let year = `Year of graductin: ${data.year}`;
            let semester = `Semester: ${data.semester}`;
            let faculty = `Faculty: ${data.faculty}`;
            let email = `Email: ${data.email}`;
            let phone = `Phone: ${data.phone}`;
            let GPA = `GPA: ${data.GPA}`;
            
            const arr = [nameEN, NID, major, faculty, year, semester, email, phone, GPA];

            console.log(arr)
            var img = fs.readFileSync('./assets/UT2.jpg').toString('base64');
            doc.addImage(img, 'jpg', 20, 5, 20, 20);
            doc.setFontSize(12);
            doc.text('University of tabuk', 80, 13);
            doc.text(`Faculty ${data.faculty}`, 70, 19);
            doc.line(20, 25, 188, 25);
            doc.setFontSize(20);
            doc.text(arr, 20.5, 32);
            doc.save(`./verified Certificates/${result.id}.pdf`);
            console.log("hi")
            setTimeout(() => {
                res.download(`./verified Certificates/${result.id}.pdf`)
            }, 200);
        })
    });
});
//1 


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
    let who = "admin"
    setTimeout(() => {
        all(alldatahashes, res, who)
    },500);
});

//تسجيل حساب لمسؤول التوظيف
app.post("/auth_reg", (req, res) => {
    const body = req.body;
    const name = body.name;
    const email = body.email;
    const password = body.password;
    const cpassword = body.cpassword;
    if(cpassword == password){
        const sql = 'select * from recruitmentofficers where email = ?';

        db.query(sql, [email], function (err, result){
            if (err) throw err;
            if(result.length > 0){
                res.render("regAndLogin" , {msg: "البريد الالكتروني مستخدم من قبل", flag: "warning"})
            }else{
                const hashpassword = bcrypt.hashSync(password, 10);
                const sql = `INSERT into recruitmentofficers(name, email, password) VALUES(?,?,?)`;
                db.query(sql, [name,email,hashpassword], function (err, data) {
                    if (err) throw err;

                    res.render("regAndLogin" , {msg: `تم التسجيل بنجاح الرجاء إرسال إثبات جهة عمل من الإيميل المسجل الى هذا الإيميل ${adminEmail}`, flag: "success"});
                })
            }
        })
    }
})



//تسجيل دخول لمسؤول التوظيف
app.post("/auth_login", (req, res) => {
    const body = req.body;
    const email = body.email;
    const password = body.password;
    const sql = 'select * from recruitmentofficers where email = ?';

    db.query(sql, [email], async (err, result) =>{
        if (err) throw err;
        if(result.length > 0){
            const isMatch = await bcrypt.compare(password, result[0].password);
            if(isMatch){
                if(result[0].verified == 1){
                req.session.email = true;           
                res.redirect("/rec")
                }else{
                    res.render("regAndLogin" , {msg: "الرجاء الإنتظار لتأكيد حسابك", flag: "warning"})
                }
            }
            else{
                res.render("regAndLogin", {msg: "كلمة المرور غير صحيحة", flag: "danger"})
            }
        }else{
            res.render("regAndLogin", {msg: "لاوجود لهذا الحساب", flag: "danger"})
        }
    })
})

//نسجيل الخروج
app.get("/auth_logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) throw err;
        res.redirect("/login")
    })
})

//تسجيل دخول الإدمن
let adminEmail = "";
app.post("/auth_admin", (req, res) => {
    const body = req.body;
    const email = body.email;
    const password = body.password;
    const sql = 'select * from admin where email = ?';

    db.query(sql, [email], async (err, result) =>{
        if (err) throw err;
        if(result.length > 0){
            const isMatch =  password == result[0].password;
            if(isMatch){
                adminEmail = email;   
                req.session.admin = true;
                        
                res.redirect("/admin")
            }
            else{
                res.redirect("/admin_login")
            }
        }else{
            res.redirect("/admin_login")
        }
    })
})

app.get("/rec", (req, res) => {
    if(req.session.email){
        all(alldatahashes, res, "recruit");
    }else{
        res.redirect("/login")
    }
})

app.get('/', (req, res) =>{
    res.render('home');
});

app.get('/verifie', (req, res) =>{
    res.render('verifie', {data: '', err: ''});
});

app.get('/admin', (req, res) =>{
    if(req.session.admin){
    all(alldatahashes, res, "admin");
    }else{
        res.redirect("/admin_Login")
    }
    // res.render('addStudent', {data: ''});
});

app.get('/login',(req,res)=>{
    res.render('regAndLogin', {msg: '', flag: ''});
    //let who = "recruit"
    //all(alldatahashes, res, who)
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
            console.log("Student updated DATABASE successfully ")
    });

    const sql2 = `DELETE FROM certificates WHERE NIDC=?`;
    db.query(sql2, body.NID, function (err, data) {
        if (err) throw err;
    });

    getObject(body).then(data => {
        students.updateById(data.id, data, function (err, objectSaved) {
            if (!err) {
                all(alldatahashes, res, "admin")
            } else {
                res.send(err)
            }
        });
    });

});

app.get('/delete/:id', (req,res) => {
    const sql = `DELETE FROM students WHERE NID=?`;
    db.query(sql, req.params.id, function (err, data) {
        if (err) console.log(err.sqlMessage);
            console.log("Student deleted from DATABASE successfully ")
    });

    students.deleteById(req.params.id, function (err, found) {
        if (!err) {
            res.redirect("/admin");
        } else {
            res.send(err)
        }
    });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
