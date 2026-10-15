// Creates the least-privilege user the API connects as: readWrite on the
// application database only, instead of the root account.
//
// Runs automatically when the data directory is first initialized. For an
// existing deployment, run it once (idempotent):
//   docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin /docker-entrypoint-initdb.d/10-app-user.js'
const appUser = process.env.MONGO_APP_USER;
const appPassword = process.env.MONGO_APP_PASSWORD;
const appDatabaseName = process.env.MONGODB_DATABASE;
if (!appUser || !appPassword || !appDatabaseName) {
  throw new Error("MONGO_APP_USER, MONGO_APP_PASSWORD and MONGODB_DATABASE must be set");
}

const appDatabase = db.getSiblingDB(appDatabaseName);
const roles = [{ role: "readWrite", db: appDatabaseName }];
if (appDatabase.getUser(appUser)) {
  appDatabase.updateUser(appUser, { pwd: appPassword, roles });
} else {
  appDatabase.createUser({ user: appUser, pwd: appPassword, roles });
}
