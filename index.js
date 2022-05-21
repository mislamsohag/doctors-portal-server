const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

//Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_KEY}@cluster0.jsve8.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        //user Add with JWT token
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        //Create requeirAdminAuth by GET Method
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        //Create an Admin by PUT Method
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }

        })

        //create user by PUT Mathode
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })

        // Warning: This is not the proper way to query multiple collection. 
        // After learning more about mongodb. use aggregate, lookup, pipeline, match, group

        //This is not proper way to query
        app.get('/available', async (req, res) => {
            // const date = req.query.date || 'May 18, 2022';
            const date = req.query.date;

            //step 1: get all services
            const services = await serviceCollection.find().toArray();

            //step 2: get the booking of that day. output: [{}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            //step 3: for each service,
            services.forEach(service => {
                //step 04: find booking for that service. output: [{}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                //step 05: select slots the service bookings: ["", "", "", "",""]
                const bookedSlots = serviceBookings.map(book => book.slot);
                //step 06: select those slots that are not in bookedSlots

                const available = service.slots.filter(slot => !bookedSlots.includes(slot));

                //step 07: set available to slots to make it easier
                service.slot = available

                /*
                                // const booked=serviceBookings.map(s=>s.slot);
                                // service.booked=booked;
                                //উপরোক্ত ২লাইনের পরিবর্তে নিচের লাইন
                                // service.booked = serviceBookings.map(s => s.slot); //এই লাইনটি হলো দেখার জন্য
                
                                const booked = serviceBookings.map(s => s.slot);
                                const available = service.slots.filter(s => !booked.includes(s));
                */
                service.available = available;
            })

            res.send(services);
        })

        /*
         * API Naming Convention
         * app.get('/booking') //get all booking in this is 
         * app.get('/booking/:_id') //get spacific booking, 
         * app.patch('/booking/:id') //add a new booking
         * app.put('/booking/:id') //update booking/upsert=>update or insert
         * app.post('/booking') //add a new booking 
        */

        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            const authorization = req.headers.authorization;
            // console.log(authorization)
            const query = { patient: patient };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })

    } finally { }

}
run().catch(console.dir)

console.log(uri)
app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`DB connect on port ${port}`)
})