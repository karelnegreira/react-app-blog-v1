import express, { json } from "express";
import {MongoClient} from 'mongodb';
import { db, connectToDb } from "./db.js";
import fs from "fs";
import admin from "firebase-admin";
import e from "express";
import path from 'path';
import 'dotenv/config';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentials = JSON.parse(
    fs.readFileSync('./credentials.json')
);

admin.initializeApp({
    credential: admin.credential.cert(credentials),
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../build')));

//whenever path that doesnt fit the api / send it to index.html
app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, '../build/index.html'));
});

app.use( async (req, res, next) => {
    const { authtoken } = req.headers;

    if (authtoken) {
        try {
            req.user = await admin.auth().verifyIdToken(authtoken);
        } catch(e) {
            return res.sendStatus(400);
        }
    }
    req.user = req.user || {};

    next();
});

app.get('/api/articles/:name', async (req, res) => {
    const {name} = req.params;
    const {uid} = req.user;

    const article = await db.collection('articles').findOne({name});

    if (article) {
        const upvoteIds = article.upvoteIds || [];
        article.canUpvote = uid && !upvoteIds.includes(uid);
        res.json(article);
    } else {
        res.sendStatus(404);
    }
});

app.use((req, res, next) => {
    if (req.user) {
        next();
    } else {
        res.sendStatus(401);
    }
});

app.put('/api/articles/:name/upvote', async (req, res) => {
    const {name} = req.params;
    const {uid} = req.user;
    const article = await db.collection('articles').findOne({name});

    if (article) {
        const upvoteIds = article.upvoteIds || [];
        const canUpvote = uid && !upvoteIds.includes(uid);
        if (canUpvote) {
    //it will update the votes, matching by name of article 
    //in the db and adding 1 each time
    //excecuted $inc means increments, 
    await db.collection('articles').updateOne({name}, {
        $inc: {upvotes: 1}, 
        $push: {upvoteIds: uid},
    });

    }
        const updatedArticle = await db.collection('articles').findOne({name});
        res.json(updatedArticle);
    } else {
        res.send('The article does not exist')
    }   

});

app.post('/api/articles/:name/comments', async (req, res) => {
    const { name } = req.params;
    const { text } = req.body;
    const { email } = req.user;

    //adds a comment to the array of those that can be found per article,
    //the search is by name of article... 
    //it pushes as per email provided by the user, every user should
    //have an email, unique. 
    await db.collection('articles').updateOne({name}, {
        $push: {comments: {postedBy: email, text}}, 
    })

    const article = await db.collection('articles').findOne({name});
    
    if (article) {
        
        res.json(article)
    } else {
        res.send('The article does not \t exist');
    }
})

/*
app.get('/hello', (req, res) => {res.send('Hello!')});

app.post('/hello', (req, res) => {
    console.log(req.body);
    res.send(`Hello ${req.body.name}!`);
})

app.get('/hello/:name', (req, res) => {
    const {name} = req.params;
    res.send(`Hello ${name}!!!`);
})*/

const PORT = process.env.PORT || 8000;

connectToDb(() => {
    console.log('Successfully connected to DB.. ');
    app.listen(PORT, () => {
        console.log('The server is listenning in port ' + PORT);
    });
})