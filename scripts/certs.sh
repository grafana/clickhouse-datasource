openssl req -subj "/CN=foo" -new \
-newkey rsa:2048 -days 365 -nodes -x509 \
-keyout $PWD/config/server.key \
-out $PWD/config/server.crt 

