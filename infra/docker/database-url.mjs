// URL codifica contraseñas con @, :, # u otros caracteres especiales.
const name = process.argv[2];
if (!['lumni_app', 'lumni_test', 'lumni_sql'].includes(name))
  throw new Error('Base local desconocida');
const url = new URL('postgresql://postgres:5432');
url.username = process.env.PGUSER ?? 'lumni';
url.password = process.env.PGPASSWORD ?? '';
url.pathname = name;
process.stdout.write(url.href);
