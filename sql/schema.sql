CREATE TABLE rooms (id serial PRIMARY KEY, name text NOT NULL,
  size text NOT NULL CHECK (size IN ('small','medium','large')),
  hourly_rate numeric(14,2) NOT NULL);
CREATE TABLE customers (id serial PRIMARY KEY, email text UNIQUE NOT NULL, full_name text NOT NULL, company text);
CREATE TABLE bookings (id serial PRIMARY KEY, customer_id int REFERENCES customers, room_id int REFERENCES rooms,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL, total numeric(14,2) NOT NULL,
  status text CHECK (status IN ('draft','confirmed','completed','cancelled')),
  payment_status text CHECK (payment_status IN ('unpaid','partial','paid')));
CREATE TABLE booking_lines (id serial PRIMARY KEY, booking_id int REFERENCES bookings,
  concept text NOT NULL, amount numeric(14,2) NOT NULL); -- base, descuento, recargo, servicios
CREATE TABLE payments (id serial PRIMARY KEY, booking_id int REFERENCES bookings, amount numeric(14,2),
  external_event_id text, paid_at timestamptz);
