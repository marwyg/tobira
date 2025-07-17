Name:           tobira
Version:        %{tobira_version}
Release:        1%{?dist}
Summary:        A modern web frontend for Opencast

License:        Apache-2.0
URL:            https://github.com/elan-ev/tobira
Source0:        tobira-x86_64-unknown-linux-gnu
Source1:        config.toml
Source2:        tobira.service
Source3:        tobira-worker.service
Source4:        LICENSE
Source5:        README.md

BuildArch:      x86_64
Requires:       glibc

%description
Tobira is a modern, user-friendly web interface for Opencast. It allows
you to browse, search, and watch media published in Opencast.

For changelog and release notes, see:
  https://github.com/elan-ev/tobira/releases

%prep

%build

%pre
getent group tobira >/dev/null || groupadd -r tobira
getent passwd tobira >/dev/null || useradd -r -M -g tobira -s /sbin/nologin tobira

%install
mkdir -p $RPM_BUILD_ROOT/usr/bin
install -m 0755 %{SOURCE0} $RPM_BUILD_ROOT/usr/bin/tobira

mkdir -p $RPM_BUILD_ROOT/etc/tobira
install -m 0644 %{SOURCE1} $RPM_BUILD_ROOT/etc/tobira/config.toml

mkdir -p $RPM_BUILD_ROOT/var/log/tobira

mkdir -p $RPM_BUILD_ROOT/var/lib/tobira

mkdir -p $RPM_BUILD_ROOT/usr/lib/systemd/system
install -m 0644 %{SOURCE2} $RPM_BUILD_ROOT/usr/lib/systemd/system/tobira.service
install -m 0644 %{SOURCE3} $RPM_BUILD_ROOT/usr/lib/systemd/system/tobira-worker.service

mkdir -p $RPM_BUILD_ROOT/usr/share/licenses/tobira
install -m 0644 %{SOURCE4} $RPM_BUILD_ROOT/usr/share/licenses/tobira/LICENSE

mkdir -p $RPM_BUILD_ROOT/usr/share/doc/tobira/
install -m 0644 %{SOURCE5} $RPM_BUILD_ROOT/usr/share/doc/tobira/

%post
echo "====================================================================="
echo "IMPORTANT: Tobira requires PostgreSQL and Meilisearch to be installed."
echo "Please refer to the documentation for version %{tobira_version}:"
echo "https://elan-ev.github.io/tobira/setup/requirements"
echo "====================================================================="
# Reload the daemon to recognize new unit files
systemctl daemon-reload >/dev/null 2>&1 || :

%preun
# Stop Tobira (if running) and disable it BEFORE package uninstallation.
if [ "$1" -eq "0" ] ; then
    echo "Stopping and disabling tobira.service..."
    systemctl stop tobira.service >/dev/null 2>&1 || :
    systemctl disable tobira.service >/dev/null 2>&1 || :

    echo "Stopping and disabling tobira-worker.service..."
    systemctl stop tobira-worker.service >/dev/null 2>&1 || :
    systemctl disable tobira-worker.service >/dev/null 2>&1 || :

    # Reload systemd daemon after disabling units
    systemctl daemon-reload >/dev/null 2>&1 || :
fi

%files
%attr(0755, tobira, tobira) /usr/bin/tobira
%dir %attr(0755, tobira, tobira) /var/log/tobira
%dir %attr(0755, tobira, tobira) /var/lib/tobira
%config(noreplace) %attr(0644, tobira, tobira) /etc/tobira/config.toml
%config(noreplace) /usr/lib/systemd/system/tobira.service
%config(noreplace) /usr/lib/systemd/system/tobira-worker.service
%license /usr/share/licenses/tobira/LICENSE
%doc /usr/share/doc/tobira/README.md