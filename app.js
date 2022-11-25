const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//Converting stateDBObject to responseStateDBObject
const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

//Converting districtDBObject to responseDistrictDBObject
const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//Middleware Function: authenticateToken
//Authentication with Token
//Scenario 1 => If the token is not provided by the user or an invalid token
//Scenario 2 => After successful verification of token proceed to next middleware or handler
function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token"); //Scenario 1
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token"); //Scenario 1
      } else {
        next(); //Scenario 2
      }
    });
  }
}

//API:1 => Path: /login/
//Scenario 1 => If an unregistered user tries to login 
//Scenario 2 => If the user provides an incorrect password
//Scenario 3 => Successful login of the user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
  SELECT 
    * 
  FROM 
    user 
  WHERE 
    username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user"); //Scenario 1
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken }); //Scenario 3
    } else {
      response.status(400);
      response.send("Invalid password"); //Scenario 2
    }
  }
});

//API:2 => Path: /states/
//Description: Returns a list of all states in the state table
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      *
    FROM
      state
    ORDER BY
      state_id;`;
    const getStatesQueryResponse = await db.all(getStatesQuery);
    response.send(
      getStatesQueryResponse.map(
        (eachState) => convertStateDbObjectToResponseObject(eachState)
      )
    );
});

//API:3 => Path: /states/:stateId/
//Description: Returns a state based on the state ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT
      *
    FROM
      state
    WHERE
      state_id = ${stateId};`;
    const getStateQueryResponse = await db.get(getStateQuery);
    response.send(
      convertStateDbObjectToResponseObject(getStateQueryResponse)
    );
});

//API:4 => Path: /districts/
//Description: Create a district in the district table, district_id is auto-incremented
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
    INSERT INTO 
      district (district_name, state_id, cases, cured, active, deaths) 
    VALUES 
      (
        '${districtName}', 
        '${stateId}',
        '${cases}', 
        '${cured}',
        '${active}',
        '${deaths}'
       )`;
    await db.run(createDistrictQuery);
    response.send(`District Successfully Added`);
});

//API:5 => Path: /districts/:districtId/
//Description: Returns a district based on the district ID
app.get("/districts/:districtId/", authenticateToken, async (request, response) => {
    const { districtId } = request.params;
    const getDistrictByIdQuery = `
    SELECT 
      * 
    FROM 
      district 
    WHERE 
      district_id = ${districtId};`;
    const getDistrictByIdQueryResponse = await db.get(getDistrictByIdQuery);
    response.send(convertDistrictDbObjectToResponseObject(getDistrictByIdQueryResponse));
  }
);

//API:6 => Path: /districts/:districtId/
//Description: Deletes a district from the district table based on the district ID
app.delete("/districts/:districtId/", authenticateToken, async (request, response) => {
  const { districtId } = request.params;
  const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId};`;
  await db.run(deleteDistrictQuery);
  response.send("District Removed");
});

//API:7 => Path: /districts/:districtId/
//Description: Updates the details of a specific district based on the district ID
app.put("/districts/:districtId/", authenticateToken, async (request, response) => {
  const { districtId } = request.params;
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const updateDistrictQuery = `
  UPDATE 
    district 
  SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths} 
  WHERE 
    district_id = ${districtId};`;
  const updateDistrictQueryResponse = await db.run(updateDistrictQuery);
  response.send("District Details Updated");
});
//API:8 => Path: /states/:stateId/stats/
//Description: Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get("/states/:stateId/stats/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateByIDStatsQuery = `
    SELECT
      sum(cases) as totalCases,
      sum(cured) as totalCured,
      sum(active) as totalActive,
      sum(deaths) as totalDeaths
    FROM
      district 
    WHERE
      state_id = ${stateId};`;
    const getStateByIDStatsQueryResponse = await db.get(getStateByIDStatsQuery);
    response.send(getStateByIDStatsQueryResponse);
});

module.exports = app;