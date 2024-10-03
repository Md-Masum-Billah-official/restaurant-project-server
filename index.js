const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
const SSLCommerzPayment = require('sslcommerz-lts')
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY
});




// middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hl4bg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("restaurantDb").collection("users");
    const menuCollection = client.db("restaurantDb").collection("menu");
    const reviewsCollection = client.db("restaurantDb").collection("reviews");
    const cartCollection = client.db("restaurantDb").collection("carts");
    const paymentCollection = client.db("restaurantDb").collection("payments");
    const reservationsCollection = client.db("restaurantDb").collection("reservations");


    // jwt related api

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    })

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorize access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorize access' });
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // user related api

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })


    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })


    app.post('/users', async (req, res) => {
      const user = req.body;

      // insert email if user doesn't exits
      const query = { email: user.email };
      const exitingUser = await userCollection.findOne(query);
      if (exitingUser) {
        return res.send({ message: "user already exits", insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });


    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin"
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })


    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // menu collection
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query);
      res.send(result);
    })

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
        }
      }
      const result = await menuCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    // reviews collection
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    })


    app.post('/reviews', verifyToken, async (req, res) => {
      const item = req.body;
      const result = await reviewsCollection.insertOne(item);
      res.send(result);
    });

    // Reservation items


    app.post('/reservations', async (req, res) => {
      const item = req.body;
      const result = await reservationsCollection.insertOne(item);
      res.send(result);
    });

    app.get('/reservations', verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await reservationsCollection.find(query).toArray();
      res.send(result);
    })

    app.delete('/reservations/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await reservationsCollection.deleteOne(query);
      res.send(result);
    })



    // cart collection

    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })


    // cart menu delete
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })


    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //  carefully delete each item from the cart
      console.log('payment info', payment);
      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      };

      const deleteResult = await cartCollection.deleteMany(query);

      // send user email about your payment confirmation
      mg.messages
        .create(process.env.MAIL_SENDING_DOMAIN, {
          from: "Mailgun Sandbox  <postmaster@sandbox327c4c33569b4a9e8b8db7bc5c6be170.mailgun.org>",
          to: ["istiaqueahmedsajeeb2017@gmail.com"],
          subject: "Restaurent Order Confirmation",
          text: "Testing some Mailgun awesomness!",
          html: `
          <div>
            <h1>Thank your for your order.</h1>
            <h2>Your Transaction Id: <strong>${payment.transaction}</strong></h2>
            <p>We would like to get your feedback.</p>
        </div>
        `
        })
        .then(msg => console.log(msg)) // logs response data
        .catch(err => console.error(err)); // logs any error

      res.send({ paymentResult, deleteResult });
    })





    // stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {

      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();



      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('project is running')
})

app.listen(port, () => {
  console.log(`Resturant Project is sitting on port ${port}`)
})