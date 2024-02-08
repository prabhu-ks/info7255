const express = require('express');
const app = express();
const port = 3000;
const etag = require('etag');
const redis = require('redis');
const Ajv = require('ajv');
const addFormats = require("ajv-formats");
const schema = require('./schema/schema.json')


const redisClient = redis.createClient({
    url: 'redis://127.0.0.1:6379'
});

redisClient.connect();

app.use(express.json());
app.post('/v1/plan', async (req, res) => {
    const ajv = new Ajv();
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(req.body);

    if (!valid) {
        return res.status(400).send({ message: "Validation failed", errors: validate.errors });
    }


    const requestBodyString = JSON.stringify(req.body);
    const objectId = req.body.objectId;
    if (!objectId) {
        return res.status(400).send({ message: "Missing objectId in the request body." });
    }
    await redisClient.set(objectId, requestBodyString);
    const dataString = await redisClient.get(objectId);
    const generatedEtag = etag(dataString);
    res.set('ETag', generatedEtag);
    res.status(201).send(JSON.parse(dataString))
});

app.get('/v1/plan/:id', async (req, res) => {
    const objectId = req.params.id;

    try {
        const dataString = await redisClient.get(objectId);
        if (dataString) {
          const generatedEtag = etag(dataString);
    
          const clientEtag = req.headers['if-none-match'];
    
          if (clientEtag === generatedEtag) {
            res.status(304).end();
          } else {
            res.set('ETag', generatedEtag);
            res.status(200).json(JSON.parse(dataString));
          }
        } else {
          res.status(404).send({ message: 'Data not found' });
        }
      } catch (error) {
        console.error('Error retrieving data:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
});

app.delete('/v1/plan/:id', async (req, res) => {
    const objectId = req.params.id;

    const dataExists = await redisClient.exists(objectId);

    if (dataExists) {
        await redisClient.del(objectId);
        res.status(200).send({ message: 'Data deleted successfully' });
    } else {
        res.status(404).send({ message: 'Data not found' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});