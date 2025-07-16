Name:           tobira
Version:        %{tobira_version}
Release:        1%{?dist}
Summary:        A modern web frontend for Opencast

License:        Apache-2.0
URL:            https://github.com/elan-ev/tobira
Source0:        tobira-x86_64-unknown-linux-gnu
Source1:        config.toml

BuildArch:      x86_64
Requires:       glibc

%description
Tobira is a modern, user-friendly web interface for Opencast. It allows
you to browse, search, and watch media published in Opencast.

%prep

%build

%pre
getent group tobira >/dev/null || groupadd -r tobira
getent passwd tobira >/dev/null || useradd -r -g tobira -d /opt/tobira -s /sbin/nologin tobira

%install
mkdir -p %{buildroot}/opt/tobira
install -m 0755 %{SOURCE0} %{buildroot}/opt/tobira/tobira

mkdir -p %{buildroot}/etc/tobira
install -m 0644 %{SOURCE1} %{buildroot}/etc/tobira/config.toml

%post
echo "====================================================================="
echo "IMPORTANT: Tobira requires PostgreSQL and Meilisearch to be installed."
echo "Please refer to the documentation for version %{tobira_version}:"
echo "  https://elan-ev.github.io/tobira/setup/requirements"
echo "====================================================================="

%files
%attr(0755, tobira, tobira) /opt/tobira/tobira
%attr(0644, tobira, tobira) /etc/tobira/config.toml
