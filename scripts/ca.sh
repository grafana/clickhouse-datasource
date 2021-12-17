# create a ca certificate

openssl genrsa -out $PWD/config-secure/my-own-ca.key 2048
openssl req -new -x509 -days 3650 -key $PWD/config-secure/my-own-ca.key \
  -subj "/CN=root" \
  -addext "subjectAltName = DNS:root" \
  -sha256 -extensions v3_ca -out $PWD/config-secure/my-own-ca.crt

# if running an older version of openssl
# openssl req -new -x509 -days 3650 -key $PWD/config-secure/my-own-ca.key \
#   -subj "/CN=root" \
#   -sha256 -extensions v3_ca -out $PWD/config-secure/my-own-ca.crt \
#   -extfile $PWD/scripts/ca.ext