const express = require('express')
const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Sever Running at http://localhost:3000/'),
    )
  } catch (e) {
    console.log(`DbError${e.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

//API 1 register
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `
        SELECT * FROM user WHERE username="${username}"
    `
  const dbResponse = await db.get(selectUserQuery)
  const hashPassword = await bcrypt.hash(password, 10)
  console.log(hashPassword)
  console.log(dbResponse)
  if (dbResponse === undefined) {
    const createUserQuery = `
        INSERT INTO 
          user (name,username, password, gender)
        VALUES(
          "${name}",
          "${username}",
          "${hashPassword}",
          "${gender}"
        )
      `
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API 2 login

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT * FROM user WHERE username="${username}";
  `
  const dbResponse = await db.get(selectUserQuery)
  if (dbResponse === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      dbResponse.password,
    )
    if (isPasswordCorrect) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'SERETE-CODE')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// Authentication with JWT Token
const AuthenticationToken = (request, response, next) => {
  let jwtToken = null
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SERETE-CODE', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send(`Invalid JWT Token`)
      } else {
        request.username = payload.username
        console.log(payload)
        console.log(request.username)
        next()
      }
    })
  }
}

// API 3

app.get(
  '/user/tweets/feed/',
  AuthenticationToken,
  async (request, response) => {
    const {username} = request
    console.log('hi')
    console.log(username)

    const getFollowingUserSIds = `
        SELECT following_user_id FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id WHERE username="${username}";
    `
    const dbResponse = await db.all(getFollowingUserSIds)
    //response.send(dbResponse)

    const following_ids = dbResponse.map(eachUser => {
      return eachUser.following_user_id
    })
    console.log(following_ids)
    const getTweets = `
      SELECT username,tweet,date_time AS dateTime 
      FROM user INNER JOIN tweet ON user.user_id=tweet.user_id 
      WHERE user.user_id IN (${following_ids})
      ORDER BY date_time DESC LIMIT 4 ;
    `
    const tweets = await db.all(getTweets)
    response.send(tweets)
  },
)

//API 4

app.get('/user/following/', AuthenticationToken, async (request, response) => {
  const {username} = request
  const getFollowingUserSIds = `
        SELECT following_user_id FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id WHERE username="${username}";
    `
  const dbResponse = await db.all(getFollowingUserSIds)
  const following_ids = dbResponse.map(eachUser => {
    return eachUser.following_user_id
  })
  console.log(following_ids)

  const getFollowingUserNames = `
      SELECT name 
      FROM user  
      WHERE user_id IN (${following_ids});
    `
  const names = await db.all(getFollowingUserNames)
  console.log(names)
  response.send(names)
})

// API 5

app.get('/user/followers/', AuthenticationToken, async (request, response) => {
  const {username} = request
  console.log(username)
  const getFollowersIds = `
        SELECT follower_id FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id WHERE username="${username}";
    `
  const dbResponse = await db.all(getFollowersIds)
  console.log(dbResponse)
  const follower_ids = dbResponse.map(eachUser => {
    return eachUser.follower_id
  })
  console.log(follower_ids)

  const getFollowerNames = `
      SELECT name 
      FROM user  
      WHERE user_id IN (${follower_ids});
    `
  const names = await db.all(getFollowerNames)
  console.log(names)
  response.send(names)
})

const UserFollowingVerified = async (request, response, next) => {
  const {username} = request
  const {tweetId} = request.params
  const getFollowingUserSIds = `
        SELECT following_user_id FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id WHERE username="${username}";
    `
  const dbResponse = await db.all(getFollowingUserSIds)
  const following_ids = dbResponse.map(eachUser => {
    return eachUser.following_user_id
  })
  console.log(following_ids)

  const tweetsIds = `
    SELECT * FROM user INNER JOIN tweet on user.user_id=tweet.user_id WHERE user.user_id IN (${following_ids}) AND tweet.tweet_id=${tweetId};
  `
  const getTweetDetails = await db.get(tweetsIds)
  console.log(getTweetDetails === undefined)
  if (getTweetDetails === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    console.log('hi')
    next()
  }
}

//API 6
app.get(
  '/tweets/:tweetId/',
  AuthenticationToken,
  UserFollowingVerified,
  async (request, response) => {
    const {tweetId} = request.params
    /*const getDetails = `
      SELECT tweet,COUNT(like_id) AS likes,COUNT(reply_id)AS replies,date_time AS dateTime FROM (tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id) AS T INNER JOIN like ON T.tweet_id=like.tweet_id WHERE T.tweet_id=${tweetId};
     `*/
    const getDetails = `
      SELECT tweet, (SELECT COUNT() FROM like WHERE  tweet_id=${tweetId}) As likes,
                    (SELECT COUNT() FROM reply WHERE tweet_id=${tweetId}) As replies,
                    date_time AS dateTime FROM tweet WHERE tweet_id=${tweetId}; 
    `
    const dbResult = await db.get(getDetails)
    response.send(dbResult)

    //response.send(getTweetDetails)
  },
)

//APi 7

app.get(
  '/tweets/:tweetId/likes/',
  AuthenticationToken,
  UserFollowingVerified,
  async (request, response) => {
    const {tweetId} = request.params
    const getUseerNames = `
      SELECT username FROM like INNER JOIN user ON like.user_id=user.user_id WHERE like.tweet_id=${tweetId};
    `
    let list = []
    const dbResponse = await db.all(getUseerNames)
    const listOfNames = dbResponse.map(each => {
      return list + [each.username]
    })
    //response.send(dbResponse)
    response.send({likes: listOfNames})
  },
)

//API 8

app.get(
  '/tweets/:tweetId/replies/',
  AuthenticationToken,
  UserFollowingVerified,
  async (request, response) => {
    const {tweetId} = request.params
    const getListOfReplies = `
    SELECT name, reply FROM user INNER JOIN reply ON user.user_id=reply.user_id WHERE reply.tweet_id=${tweetId};
  `
    const dbResponse = await db.all(getListOfReplies)
    response.send({replies: dbResponse})
  },
)

//API 9
app.get('/user/tweets/', AuthenticationToken, async (request, response) => {
  const {username} = request
  /*const getTweetsOfUser = `
    SELECT tweet,COUNT(like_id) AS likes, COUNT(reply_id) AS replies, date_time AS dateTime FROM ((tweet INNER JOIN user ON tweet.user_id=user.user_id) AS T INNER JOIN reply ON T.user_id=reply.user_id) AS N INNER JOIN like ON N.user_id=like.user_id WHERE user.username="${username}";
  `*/
  const getUserId = `
    SELECT user_id,username FROM user WHERE user.username="${username}";
  `
  const dbuserId = await db.get(getUserId)
  console.log(dbuserId)
  const userId = dbuserId.user_id
  console.log(userId)
  const getTweetsOfUser = `
    SELECT tweet, (SELECT COUNT() FROM like WHERE user_id=${userId}) AS likes,
                  (SELECT COUNT() FROM reply WHERE user_id=${userId}) AS replies,
                  date_time AS dateTime FROM tweet  WHERE user_id=${userId};
  `
  const dbResponse = await db.all(getTweetsOfUser)
  response.send(dbResponse)
})

//ApI 10
app.post('/user/tweets/', AuthenticationToken, async (request, response) => {
  const {tweet} = request.body
  console.log(tweet)
  const CreatePost = `
    INSERT INTO tweet (tweet) VALUES ("${tweet}");
  `
  await db.run(CreatePost)
  console.log(CreatePost)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  AuthenticationToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserTweet = `
    SELECT * FROM tweet INNER JOIN user ON tweet.user_id=user.user_id WHERE user.username="${username}" AND tweet.tweet_id=${tweetId};
  `
    const dbResponse = await db.get(getUserTweet)
    if (dbResponse === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteTweet = `
        DELETE FROM tweet WHERE tweet_id=${tweetId};
      `
      await db.run(deleteTweet)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
