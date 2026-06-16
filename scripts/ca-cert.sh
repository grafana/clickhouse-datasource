# Generate server.key and server.crt signed by our local CA. 
openssl genrsa -out $PWD/config-secure/server.key 2048
# TODO - use localhost instead of foo?
openssl req -sha256 -new -key $PWD/config-secure/server.key -out $PWD/config-secure/server.csr \
  -subj "/CN=foo" \

openssl x509 -req -in $PWD/config-secure/server.csr -CA $PWD/config-secure/my-own-ca.crt -CAkey $PWD/config-secure/my-own-ca.key \
-CAcreateserial -out $PWD/config-secure/server.crt -days 825 -sha256 -extfile $PWD/config-secure/server.ext

# Confirm the certificate is valid. 
openssl verify -CAfile $PWD/config-secure/my-own-ca.crt $PWD/config-secure/server.crt