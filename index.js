const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');

require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

// middelware
app.use(cors());
app.use(express.json());

// CONNECT DATABASE
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6ujfpan.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function varifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'UnAuthorized access '})
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
        if(err){
            return res.status(403).send({message: 'Forbidden access '})
        }
        req.decoded = decoded
        next();
      });
}

async function run (){
    try{
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services')
        const bookingsCollection = client.db('doctors_portal').collection('bookings')
        const usersCollection = client.db('doctors_portal').collection('users')
        const doctorsCollection = client.db('doctors_portal').collection('doctors')

        // varifyAdmin jwt
        const varifyAdmin = async(req, res, next) =>{
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({email: requester});
            if(requesterAccount.role === 'admin'){
                next();
            }
            else{
                res.status(403).send({message: 'Forbidden access'})
            }

        }
        
        console.log('database connected')
        // services api //
        app.get('/services', async (req, res)=>{
            const query = {};
            const cursor = servicesCollection.find(query).project({name:1});
            const services = await cursor.toArray();
            res.send(services)
        } )

        // app.get('/user', varifyJWT, async (req, res)=>{
        //     const users = await usersCollection.find().toArray();
        //     res.send(users);
        // })

        app.get("/user", varifyJWT, async (req, res) => {
        const users = await usersCollection.find().toArray();
        res.send(users);
          });

        // create or update users
        app.put('/user/:email', async(req, res)=>{
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email}
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
              };
              const result = await usersCollection.updateOne(filter, updateDoc, options);
              const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
              res.send({result, token});
        })

        // admin protected route
        app.get('/admin/:email', async(req, res)=>{
            const email = req.params.email;
            const user = await usersCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin});

        })

        // Make user an Admin
        app.put('/user/admin/:email', varifyJWT, varifyAdmin, async(req, res)=>{
            const email = req.params.email;
                const filter = {email: email}
                const updateDoc = {
                    $set: {role:'admin'},
                  };
                  const result = await usersCollection.updateOne(filter, updateDoc);
                  res.send(result);
        })

        app.get('/available', async(req, res)=>{
            const date = req.query.date;

            // step 1: get All services
            const services = await servicesCollection.find().toArray();
            
            // step:2 get the booking of that day
            const query = {date:date};
            const bookings = await bookingsCollection.find(query).toArray();

            services.forEach(service=>{
                // step:4  find bookings for that service
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step:5 select slots for the service bookings
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step:6 select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                service.slots = available;
            })


            res.send(services);
        })


        // API Naming Convention
        /**
         * app.get('/booking') // get all bookings in this collection. or get more then one or by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id') // update a specific booking
         * app.delete('/booking/:id') // delet a specific booking
         *
         * 
         */
        
        app.get('/booking', varifyJWT, async(req, res)=>{
            const patient = req.query.patient;
            // const authorization = req.headers.authorization;
            const decodedEmail = req.decoded.email;

            if(patient === decodedEmail){
            const query = {patient: patient};
            const bookings = await bookingsCollection.find(query).toArray();
            return res.send(bookings)
            }
            else{
                return res.status(403).send({message: 'Forbidden access '})
            }
            
        })

        app.post('/booking',  async(req, res)=>{
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
            const exists = await bookingsCollection.findOne(query);
            
            if(exists){
                return res.send({success: false, booking: exists})
            }
            else {
                const result = await bookingsCollection.insertOne(booking);
                res.send({ success: true, result: result });
              }

          
        });

        // Load all doctors
        app.get('/doctor', varifyJWT, varifyAdmin, async(req, res)=>{
            const doctors = await doctorsCollection.find().toArray();
            res.send(doctors);

        })

          // create a doctor
          app.post('/doctor', varifyJWT, varifyAdmin, async (req, res)=>{
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
            })

    }
    finally{

    }
}

run().catch(console.dir)


app.get('/', (req, res)=>{
    res.send('Running doctors portal')
})

app.listen(port, ()=>{
    console.log('Listening to port', port);
})